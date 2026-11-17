/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA PROPOSTA, NA LÍNGUA DO CASAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: preparar a proposta em português, como sempre, e no momento de
 * gerar poder escolher que o PDF saia em inglês.
 *
 * ── O QUE ESTE FICHEIRO TRADUZ, E O QUE NÃO TRADUZ ─────────────────────────
 *
 * TRADUZ o que o DOCUMENTO diz por si: os títulos das secções, os cabeçalhos
 * do quadro, os rótulos dos campos, o texto padrão da casa (notas, condições,
 * observações), a forma de escrever a data e a forma de escrever o dinheiro.
 *
 * NÃO traduz o que ELA escreveu: os títulos dos serviços, as descrições, as
 * legendas dos mood boards, os nomes das rubricas do orçamento, o nome do
 * casal, o local. Isso sai tal e qual — foi uma decisão explícita, e é a
 * honesta: uma tradução automática de «Decor Cerimónia» ou de um nome de
 * quinta chega ao cliente sem ninguém a ter lido. Quem quiser esses campos em
 * inglês escreve-os em inglês.
 *
 * A consequência tem de ser dita a quem carrega no botão, e é: a proposta sai
 * com a moldura em inglês e o conteúdo dela na língua em que foi escrito.
 *
 * ── PORQUE É QUE A LÍNGUA NÃO ENTRA NO DOCUMENTO GUARDADO ──────────────────
 *
 * O `ProposalDoc` que fica gravado continua a ser um só, em português. A
 * língua é um parâmetro de DESENHO, como o tamanho da página: entra no
 * gerador, não no documento. Duas cópias do mesmo documento em duas línguas
 * seriam duas coisas para manter coerentes — e a que ninguém reabrisse
 * ficaria a mentir na primeira vez que um preço mudasse.
 */

import {
  DEFAULT_CANCELAMENTO,
  DEFAULT_CONDICOES_GERAIS,
  DEFAULT_INCLUIDO,
  DEFAULT_NAO_INCLUIDO,
  DEFAULT_NOTAS_IMPORTANTES,
  DEFAULT_OBSERVACOES_GERAIS,
  DIAS_PARA_CONFIRMAR_CONVIDADOS,
  depositPercentOf,
  faseamentoPorOmissao,
  POR_DEFINIR_PT,
  preencherMarcadores,
  type ProposalDoc,
  type RedaccoesSemDado,
} from "./proposal-doc";
import {
  CEREMONY_TYPES,
  EVENT_TYPE_NAMES,
  GUEST_RANGES,
  chaveDeRotulo,
  eventTypeName,
} from "./orcamento/data";

/** As línguas em que o documento se sabe desenhar. */
export type IdiomaDaProposta = "pt" | "en";

/* ═══════════════════════════════════════════════════════════════════════════
   O PRAZO DO SALDO — UM NÚMERO SÓ PARA AS DUAS LÍNGUAS
   ═══════════════════════════════════════════════════════════════════════════

   Quantos meses antes do evento se paga o saldo. Está dito em QUATRO frases —
   a linha do faseamento e a coluna «quando» do quadro dos pagamentos, vezes
   duas línguas — e já divergiu uma vez: a inglesa dizia um prazo que a
   portuguesa não dizia. Quatro literais soltos é a garantia de que volta a
   acontecer, e o sintoma é a proposta a marcar duas datas de pagamento
   diferentes conforme a língua em que sai — assinadas as duas.

   Daqui saem as três frases que este ficheiro escreve. A quarta (a linha
   portuguesa do faseamento) vive em `proposal-doc.ts`, ao lado da percentagem
   do sinal que a abre, e é o teste dos números que a mantém a par. */
export const MESES_ANTES_DO_SALDO = 1;

/** «1 mês» / «2 meses» — o prazo escrito como a frase o recebe. */
const mesesPt = (n: number) => `${n} ${n === 1 ? "mês" : "meses"}`;
const mesesEn = (n: number) => `${n} ${n === 1 ? "month" : "months"}`;

// `ehIdiomaDaProposta` vive ao lado da lista que lê (`orcamento/listas-fechadas.ts`).
export { ehIdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";

/**
 * A língua por omissão.
 *
 * É português, e é de propósito: todos os chamadores que existiam antes desta
 * funcionalidade continuam a desenhar exactamente o que desenhavam. Uma
 * proposta antiga, reaberta, sai como saiu.
 */
export const IDIOMA_POR_OMISSAO: IdiomaDaProposta = "pt";

/* ═══════════════════════════════════════════════════════════════════════════
   AS DATAS E O DINHEIRO — AS DUAS DECISÕES QUE NÃO SÃO DE TRADUÇÃO
   ═══════════════════════════════════════════════════════════════════════════

   ── A DATA ────────────────────────────────────────────────────────────────
   A única data que o DOCUMENTO escreve por si é a validade da proposta; em
   português sai «11 de outubro de 2026», por extenso. Em inglês sai
   «11 October 2026»: dia, mês por extenso, ano, sem vírgula e sem sufixo
   ordinal.

   Não é a forma americana («October 11, 2026») por uma razão concreta desta
   folha: a OUTRA data do documento — a do evento — é texto dela e não se
   traduz, portanto continua a ler-se «3 de julho de 2027», com o dia à frente.
   Pôr o mês primeiro na validade e o dia primeiro no evento era a marca de duas
   mãos a escrever o mesmo papel, que é exactamente o defeito que fez os meses
   passarem de abreviados a por extenso. O mês por extenso resolve, de caminho,
   a ambiguidade do 03/07 entre um leitor britânico e um americano.

   ── O DINHEIRO: FICA EM pt-PT, NAS DUAS LÍNGUAS ───────────────────────────
   «2.460,00 €» é o que sai em inglês também. Três razões, por ordem de peso:

     · METADE DO DINHEIRO DESTA FOLHA É TEXTO DELA. O «Valor Total», os valores
       adicionais e o preço estimado são campos livres, escritos à mão em
       português — e o que ela escreve não se traduz, que é a regra desta
       funcionalidade. Formatar só os números CALCULADOS à inglesa punha
       «€2,460.00» e «2.460,00 €» na mesma coluna do mesmo quadro. É o defeito
       que o `milharesComPonto` do gerador foi escrito para corrigir, e voltaria
       pela porta do lado.
     · A FACTURA SAI EM PORTUGAL. O sinal e o saldo impressos aqui são os que as
       rotas de facturação emitem, com os números escritos como o fisco
       português os escreve. Um casal a comparar a proposta com a factura tem de
       ver o mesmo número, com a mesma pontuação.
     · A VÍRGULA E O PONTO TROCAM DE PAPEL entre as duas convenções. Um leitor
       que veja «2.460,00 €» numa linha e «2,460.00 €» noutra não lê duas
       formatações: lê dois números diferentes. Uma folha de dinheiro só pode
       ter uma convenção, e a que tem de ficar é a dos números que ela escreve.

   Pela mesma razão, a percentagem do IVA («23%», «23,5%») também continua com a
   vírgula portuguesa: um ponto decimal ao lado de um ponto de milhares, na
   mesma página, é a maneira mais rápida de fazer alguém desconfiar da conta.

   O que muda em inglês é o RÓTULO — «VAT», «Total payable» —, não o número. */

/** Os meses por extenso, como o resto do documento os escreve. */
const MESES_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const MESES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "2026-09-12" → "12 de setembro de 2026" / "12 September 2026".
 *
 * Deixa passar tal e qual o que não seja uma data ISO — é o que se desenha, e
 * uma data estranha impressa é melhor do que um erro a meio da geração.
 *
 * (O motor que lê propostas de volta aceita `[a-zç]{3,10}` como mês, portanto a
 * ida e volta em português continua a devolver a data.)
 */
function dataPorExtenso(
  iso: string,
  meses: readonly string[],
  juntar: (d: number, m: string, a: string) => string,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return iso;
  return juntar(Number(m[3]), meses[mes - 1], m[1]);
}

/** Os campos da faixa de apresentação, por chave — é a chave que liga o rótulo
 *  impresso (na língua do cliente) ao rótulo do AVISO de truncagem, que é
 *  sempre em português porque quem o lê é o estúdio. */
export type CampoDoEvento =
  | "cliente"
  | "noivos"
  | "evento"
  | "data"
  | "local"
  | "convidados"
  | "servico"
  | "cerimonia"
  | "hora";

/**
 * Tudo o que o documento diz POR SI, numa língua.
 *
 * O que não está aqui é conteúdo dela e sai tal e qual — ver o cabeçalho deste
 * ficheiro. Uma entrada que falte é um pedaço de proposta que sai em português
 * dentro de um documento inglês, e isso não se vê até um cliente o ver: é para
 * isso que existe o varrimento em `proposal-doc-textos.test.ts`.
 */
export interface TextosDoDocumento {
  // ── Capa ──
  readonly capaDecoracao: string;
  readonly capaOrganizacao: string;

  // ── 1. Apresentação ──
  readonly sobretituloApresentacao: string;
  readonly tituloApresentacao: string;
  readonly campos: Readonly<Record<CampoDoEvento, string>>;

  // ── 2. Serviços ──
  readonly sobretituloServicos: string;
  readonly tituloServicos: string;

  // ── Cronograma (modelo Organização) ──
  readonly sobretituloCronograma: string;
  readonly tituloCronograma: string;

  /**
   * O sobretítulo das páginas de inspiração.
   *
   * `null` em português DE PROPÓSITO: a palavra vive em `proposal-geometria`,
   * onde vive a medida a que ela é desenhada, e é de lá que o estúdio a lê para
   * a pré-visualização. Copiá-la para aqui era criar uma segunda verdade que um
   * dia discordava da primeira. `null` quer dizer «o que a geometria disser».
   */
  readonly sobretituloInspiracao: string | null;

  // ── 3. Orçamento ──
  readonly sobretituloOrcamento: string;
  readonly tituloOrcamento: string;
  readonly colunaItem: string;
  readonly colunaPreco: string;
  readonly colunaPrecoEstimado: string;
  readonly totalEstimado: string;
  /** A marca de uma linha opcional, à direita do nome da rubrica. */
  readonly marcaExtra: string;
  readonly subtotalServicos: string;
  readonly subtotalServicosEstimado: string;
  readonly totalSemIva: string;
  /** «IVA (23%)» / «VAT (23%)» — a taxa já vem escrita. */
  readonly iva: (taxa: string) => string;
  readonly totalAPagar: string;
  /** O «+ IVA» que se acrescenta a um total que não o diga. */
  readonly maisIva: string;
  readonly semOsExtras: string;
  readonly umaLinhaExtra: string;
  readonly variasLinhasExtra: (quantas: number) => string;
  readonly nota: (texto: string) => string;
  readonly notasImportantes: string;
  readonly condicoesDeReserva: string;
  readonly incluidoNaProposta: string;
  readonly naoIncluidoNoOrcamento: string;

  // ── 4. Condições Gerais ──
  readonly sobretituloCondicoes: string;
  readonly tituloCondicoes: string;

  // ── Fecho ──
  readonly proximosPassos: string;
  readonly passoAceitar: string;
  readonly passoSinal: string;
  readonly passoValidade: (data: string) => string;
  readonly observacoesGerais: string;
  readonly faseamentoDoPagamento: string;
  readonly sinal: (pct: number) => string;
  readonly saldo: (pct: number) => string;
  readonly quandoSinal: string;
  readonly quandoSaldo: string;
  readonly baseDoCalculo: (total: string) => string;
  readonly cancelamento: string;
  readonly contactos: string;
  readonly email: string;
  readonly telefone: string;

  /**
   * O rodapé de cada folha: «01 de 09».
   *
   * É FUNÇÃO e não uma palavra solta de propósito. O que muda de língua é o
   * «de»/«of», e uma entrada de duas letras não se pode procurar dentro de um
   * PDF — «de» está dentro de metade das palavras da folha. Como função, o
   * varrimento de `proposal-doc-textos.test.ts` parte a frase pelo argumento e
   * descarta os pedaços com menos de quatro caracteres, que é exactamente o que
   * esta cola é.
   */
  readonly deFolhas: (total: string) => string;

  // ── Contracapa ──
  readonly obrigada: string;
  readonly agradecimento: string;
  /** Como o `sobretituloInspiracao`: `null` = o slogan que está em `site.ts`. */
  readonly slogan: string | null;

  /** A data por extenso, na forma que esta língua escreve (ver o cabeçalho). */
  readonly data: (iso: string) => string;
}

/**
 * O nome do MODELO — o que a capa diz depois do «Proposta ·» e a primeira
 * palavra da referência que corre no topo das páginas.
 *
 * Fora do dicionário de propósito. O varrimento de `proposal-doc-textos.test.ts`
 * procura cada frase portuguesa do dicionário dentro do PDF inglês, e a palavra
 * «Organização» sozinha aparece legitimamente numa referência escrita à mão por
 * ela — que não se traduz. Uma entrada de dicionário que dá alarme por causa de
 * conteúdo dela deixa de ser um alarme e passa a ser ruído; o que o varrimento
 * procura é a frase inteira da capa, «Proposta · Organização».
 *
 * «Planning» e não «Organisation»: é o serviço de planeamento do casamento, não
 * a organização enquanto empresa (ver {@link EN.capaOrganizacao}).
 */
const MODELO = {
  pt: { decoracao: "Decoração", organizacao: "Organização" },
  en: { decoracao: "Decoration", organizacao: "Planning" },
} as const;

const PT: TextosDoDocumento = {
  capaDecoracao: `Proposta · ${MODELO.pt.decoracao}`,
  capaOrganizacao: `Proposta · ${MODELO.pt.organizacao}`,

  sobretituloApresentacao: "A Proposta",
  tituloApresentacao: "Apresentação",
  campos: {
    cliente: "Cliente",
    noivos: "Noivos",
    evento: "Evento",
    data: "Data do Evento",
    local: "Local",
    convidados: "Número de Convidados",
    servico: "Serviço",
    cerimonia: "Cerimónia",
    hora: "Hora",
  },

  sobretituloServicos: "O que propomos",
  tituloServicos: "Serviços",

  sobretituloCronograma: "Como avançamos",
  tituloCronograma: "Cronograma de Organização",

  sobretituloInspiracao: null,

  sobretituloOrcamento: "O investimento",
  tituloOrcamento: "Orçamento Proposto",
  colunaItem: "Item",
  colunaPreco: "Preço (€)",
  colunaPrecoEstimado: "Preço Estimado (€)",
  totalEstimado: "Total Estimado",
  marcaExtra: "extra",
  subtotalServicos: "Subtotal dos serviços",
  subtotalServicosEstimado: "Subtotal dos serviços (estimado)",
  totalSemIva: "TOTAL (sem IVA)",
  iva: (taxa) => `IVA (${taxa})`,
  totalAPagar: "Total a pagar",
  maisIva: "+ IVA",
  semOsExtras: "Sem os extras assinalados",
  umaLinhaExtra: "A linha assinalada com «extra» é opcional e pode ser retirada.",
  variasLinhasExtra: (quantas) =>
    `As ${quantas} linhas assinaladas com «extra» são opcionais e podem ser retiradas.`,
  nota: (texto) => `Nota: ${texto}`,
  notasImportantes: "Notas importantes",
  condicoesDeReserva: "Condições de reserva",
  incluidoNaProposta: "Incluído na proposta:",
  naoIncluidoNoOrcamento: "Não incluído no orçamento:",

  sobretituloCondicoes: "Para sua tranquilidade",
  tituloCondicoes: "Condições Gerais",

  proximosPassos: "Próximos Passos",
  passoAceitar: "Para confirmar esta proposta, basta responder-nos por e-mail ou por telefone.",
  passoSinal: "A reserva da data só fica garantida após o pagamento do sinal.",
  passoValidade: (data) => `Esta proposta é válida até ${data}.`,
  observacoesGerais: "Observações Gerais",
  faseamentoDoPagamento: "Faseamento do Pagamento",
  sinal: (pct) => `Sinal ${pct}%`,
  saldo: (pct) => `Saldo ${pct}%`,
  quandoSinal: "na adjudicação, para reservar a data",
  quandoSaldo: `até ${mesesPt(MESES_ANTES_DO_SALDO)} antes do evento`,
  baseDoCalculo: (total) => `Calculados sobre o total a pagar — ${total}, com IVA incluído.`,
  cancelamento: "Cancelamento",
  contactos: "Contactos",
  email: "Email",
  telefone: "Telefone",

  deFolhas: (total) => `de ${total}`,

  obrigada: "OBRIGADA",
  agradecimento: "Por nos deixarem fazer parte deste momento.",
  slogan: null,

  data: (iso) => dataPorExtenso(iso, MESES_PT, (d, m, a) => `${d} de ${m} de ${a}`),
};

const EN: TextosDoDocumento = {
  capaDecoracao: `Proposal · ${MODELO.en.decoracao}`,
  // «Organização» é o serviço de planeamento do casamento, não a organização
  // enquanto empresa — «Planning» é o que um casal inglês procura.
  capaOrganizacao: `Proposal · ${MODELO.en.organizacao}`,

  sobretituloApresentacao: "The proposal",
  // «Introduction» era o que se diria de «Apresentação» num dicionário — e é o
  // que está errado: debaixo deste título não há introdução nenhuma, há a lista
  // do evento (casal, data, local, número). Um casal inglês que lê
  // «1. Introduction» e encontra oito etiquetas percebe que o documento foi
  // traduzido. «Event Overview» é o que a folha é.
  tituloApresentacao: "Event Overview",
  campos: {
    cliente: "Client",
    noivos: "Couple",
    evento: "Event",
    data: "Event Date",
    local: "Venue",
    convidados: "Number of Guests",
    servico: "Service",
    cerimonia: "Ceremony",
    hora: "Time",
  },

  sobretituloServicos: "What we propose",
  tituloServicos: "Services",

  sobretituloCronograma: "How we move forward",
  tituloCronograma: "Planning Timeline",

  sobretituloInspiracao: "Inspiration",

  sobretituloOrcamento: "The investment",
  // «Proposed Quote» é «Orçamento Proposto» palavra a palavra, e em inglês diz
  // duas vezes a mesma coisa: um quote JÁ é uma proposta de preço. «Quotation» é
  // o cabeçalho que a folha de um fornecedor britânico traz.
  tituloOrcamento: "Quotation",
  colunaItem: "Item",
  colunaPreco: "Price (€)",
  colunaPrecoEstimado: "Estimated Price (€)",
  totalEstimado: "Estimated Total",
  // A mesma palavra nas duas línguas — e é uma sorte: a marca é impressa ao
  // lado da rubrica e citada na frase que a explica, e as duas têm de dizer o
  // mesmo. Se um dia mudar aqui, muda nos dois sítios ao mesmo tempo.
  marcaExtra: "extra",
  subtotalServicos: "Services subtotal",
  subtotalServicosEstimado: "Services subtotal (estimated)",
  // «excl. VAT» e não «before VAT»: é a forma que aparece nas facturas e nos
  // orçamentos europeus, e é a que um casal irlandês ou britânico já leu.
  totalSemIva: "TOTAL (excl. VAT)",
  iva: (taxa) => `VAT (${taxa})`,
  totalAPagar: "Total payable",
  maisIva: "+ VAT",
  // As aspas são as mesmas da frase que explica a marca, três linhas abaixo: as
  // duas falam da mesma palavra impressa ao lado da rubrica.
  semOsExtras: "Excluding the lines marked “extra”",
  umaLinhaExtra: "The line marked “extra” is optional and can be removed.",
  variasLinhasExtra: (quantas) =>
    `The ${quantas} lines marked “extra” are optional and can be removed.`,
  nota: (texto) => `Note: ${texto}`,
  notasImportantes: "Important notes",
  condicoesDeReserva: "Booking conditions",
  incluidoNaProposta: "Included in the proposal:",
  naoIncluidoNoOrcamento: "Not included in the quote:",

  sobretituloCondicoes: "For your peace of mind",
  tituloCondicoes: "General Conditions",

  proximosPassos: "Next Steps",
  // «através da ligação enviada no e-mail» → «using the link in our email». O
  // literal («through the link sent by e-mail») é gramatical e não é o que se
  // escreve.
  //
  // «email» sem hífen, aqui e em toda a moldura inglesa: o rótulo do bloco de
  // contactos já é «Email», e duas grafias da mesma palavra na mesma folha leem-
  // se como descuido. É também a grafia que a casa usa em prosa no portal.
  passoAceitar: "To confirm this proposal, simply reply to us by email or by phone.",
  passoSinal: "The date is only secured once the deposit has been paid.",
  passoValidade: (data) => `This proposal is valid until ${data}.`,
  observacoesGerais: "General Remarks",
  faseamentoDoPagamento: "Payment Schedule",
  sinal: (pct) => `Deposit ${pct}%`,
  saldo: (pct) => `Balance ${pct}%`,
  quandoSinal: "on acceptance, to secure the date",
  // «até 1 mês antes» é um PRAZO — a última data em que se pode pagar. «up to 1
  // month before» lê-se em inglês como «até um mês, no máximo», que é quase o
  // contrário: dá a entender que pagar dois meses antes estaria fora de prazo.
  // «no later than» é o que um prazo diz em inglês.
  quandoSaldo: `no later than ${mesesEn(MESES_ANTES_DO_SALDO)} before the event`,
  baseDoCalculo: (total) => `Calculated on the total payable — ${total}, VAT included.`,
  cancelamento: "Cancellation",
  // «Contact», no singular. «Contacts» é o plural português: em inglês são as
  // pessoas que se conhece — a agenda —, não o bloco onde se diz como falar
  // connosco. E é a palavra que a casa já usa no sítio e no portal, que é onde
  // o mesmo casal a vai ler a seguir.
  contactos: "Contact",
  email: "Email",
  telefone: "Phone",

  deFolhas: (total) => `of ${total}`,

  obrigada: "THANK YOU",
  agradecimento: "For letting us be part of this moment.",
  slogan: "We decorate events, we make memories last.",

  data: (iso) => dataPorExtenso(iso, MESES_EN, (d, m, a) => `${d} ${m} ${a}`),
};

/** O que o documento diz por si, na língua pedida. */
export function textosDaProposta(idioma: IdiomaDaProposta): TextosDoDocumento {
  return idioma === "en" ? EN : PT;
}

/* ═══════════════════════════════════════════════════════════════════════════
   OS CAMPOS QUE O NOSSO CÓDIGO ESCREVEU
   ═══════════════════════════════════════════════════════════════════════════

   A faixa de apresentação parecia toda conteúdo dela, e não é. Quatro daqueles
   campos nascem PREENCHIDOS, a partir do pedido, por código nosso — e nasceram
   em português porque o estúdio é português:

     · `eventDate`  ← «12 de setembro de 2026», escrito a partir do `date` ISO
     · `eventType`  ← «Casamento», o nome do tipo escolhido no formulário
     · `ceremony`   ← «Civil», o tipo de cerimónia escolhido no formulário
     · `guests`     ← «100 a 150», a ordem de grandeza escolhida no formulário
     · `ref`        ← «Decoração Casamento Maria & Zé · 12 de setembro de 2026»,
                      composta pelos quatro primeiros e impressa no topo de
                      TODAS as páginas

   Numa proposta inglesa isso dava um documento com a moldura inglesa e a data do
   casamento em português — na capa, na faixa, dentro de uma cláusula das
   Condições Gerais e no cabeçalho de cada folha. A mesma data aparecia duas
   vezes na mesma página, escrita de duas maneiras: «Event Date: 12 de setembro
   de 2026» por cima e «This proposal is valid until 11 October 2026» por baixo.

   ── A REGRA, E PORQUE É QUE ELA É UMA COMPARAÇÃO ──────────────────────────

   É a mesma do texto padrão da casa, mais abaixo, e pela mesma razão: depois de
   preenchido, um campo escrito por nós é indistinguível de um campo escrito por
   ela — os dois são texto livre no mesmo sítio, e ela pode reescrever qualquer
   um. Portanto pergunta-se ao valor se ele AINDA É o que o nosso código escreve:

     · se é, sai na língua do documento;
     · se não é, é dela e sai tal e qual — não se traduz prosa dela.

   «Renovação de votos» no campo do tipo, «no fim de semana da vindima» no da
   data, «Só a bênção, no claustro» no da cerimónia: nada disto se toca. O pior
   que pode acontecer é uma proposta inglesa levar um campo em português que
   alguém escreveu à mão — visível, e verdadeiro.

   ── DE ONDE VÊM AS PALAVRAS ───────────────────────────────────────────────

   Não daqui. Os nomes dos tipos de evento, dos tipos de cerimónia e das ordens
   de grandeza já existem nas duas línguas em `orcamento/data.ts`, que é onde o
   formulário público os lê para os mostrar a quem preenche. Uma segunda tabela
   aqui era uma segunda verdade: acrescentar um tipo de evento lá passava a
   obrigar a lembrar-se deste ficheiro, e o dia em que alguém se esquecesse a
   proposta inglesa dizia «Batizado». */

/** "12 de setembro de 2026" → "2026-09-12". `null` para tudo o resto — que é
 *  como se sabe que a data já não é a que o estúdio escreveu.
 *
 *  Exportada porque o NOME DO FICHEIRO da proposta também precisa da data do
 *  evento (ver `email-proposta-textos.ts`), e uma segunda leitura da mesma
 *  forma escrita era a garantia de que um dia divergiam — que é o mesmo
 *  raciocínio que já prende esta função à `dataDoEventoPorExtenso`. */
export function isoDaDataPorExtenso(texto: string): string | null {
  const m = /^(\d{1,2}) de ([a-zç]+) de (\d{4})$/i.exec(texto.trim());
  if (!m) return null;
  const mes = MESES_PT.indexOf(m[2].toLowerCase());
  if (mes < 0) return null;
  return `${m[3]}-${String(mes + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/**
 * A data do evento por extenso, na língua pedida.
 *
 * É esta função que o ESTÚDIO usa para semear o campo a partir do `date` do
 * pedido, e por isso é ela que define a forma que {@link isoDaDataPorExtenso}
 * tem de saber reconhecer. Escrever a data num sítio e reconhecê-la noutro dava
 * duas formas que divergiam à primeira vírgula — e o sintoma seria uma data que
 * deixa de se traduzir, sem erro nenhum pelo caminho.
 */
export function dataDoEventoPorExtenso(
  iso: string,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): string {
  return textosDaProposta(idioma).data(iso);
}

/** Um rótulo NOSSO → o mesmo rótulo em inglês. Vazio quando o valor não é um
 *  dos nossos (e aí quem chama deixa-o como está). */
function traduzido(valor: string, tabela: ReadonlyMap<string, string>): string {
  return tabela.get(chaveDeRotulo(valor)) ?? "";
}

/** Os nomes dos tipos de evento que o estúdio escreve, em inglês. */
const TIPOS_DE_EVENTO_EN: ReadonlyMap<string, string> = new Map([
  ...Object.keys(EVENT_TYPE_NAMES).map(
    (id) => [chaveDeRotulo(eventTypeName(id, "pt")), eventTypeName(id, "en")] as const,
  ),
  // O estúdio não deixa o campo vazio: um pedido de empresa sem tipo conhecido
  // abre com esta etiqueta, que não está na taxonomia (ver `ProposalStudio`).
  [chaveDeRotulo("Evento Corporativo"), "Corporate Event"] as const,
]);

const CERIMONIAS_EN: ReadonlyMap<string, string> = new Map(
  CEREMONY_TYPES.map((c) => [chaveDeRotulo(c.label), c.en] as const),
);

const CONVIDADOS_EN: ReadonlyMap<string, string> = new Map(
  GUEST_RANGES.map((g) => [chaveDeRotulo(g.label), g.en] as const),
);

/**
 * A cerimónia, que é o único destes campos que pode trazer DUAS escolhas.
 *
 * «Civil e religiosa» é uma opção só e está na tabela. O que a tabela não tem é
 * a lista — «Civil, simbólica» —, que é a forma sugerida pelo próprio estúdio (é
 * o texto de exemplo da caixa) e que uma pessoa escreve sem pensar duas vezes.
 * Separa-se só por vírgula e por barra, nunca pelo «e», que é parte do nome de
 * uma das opções. Uma lista só se traduz se TODAS as partes forem nossas: basta
 * uma palavra dela para o campo inteiro ficar como está.
 *
 * A caixa da parte inglesa segue a da portuguesa — quem escreveu «Civil,
 * simbólica» quis a segunda em minúscula, e recebe «Civil, symbolic».
 */
function cerimoniaEmIngles(valor: string): string {
  const inteiro = traduzido(valor, CERIMONIAS_EN);
  if (inteiro) return inteiro;
  const partes = valor.split(/\s*[,/]\s*/).filter(Boolean);
  if (partes.length < 2) return "";
  const emIngles = partes.map((p) => {
    const en = traduzido(p, CERIMONIAS_EN);
    if (!en) return "";
    // Minúscula em português, minúscula em inglês.
    return /^[a-zà-ÿ]/.test(p) ? en.charAt(0).toLowerCase() + en.slice(1) : en;
  });
  return emIngles.every(Boolean) ? emIngles.join(", ") : "";
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A HORA — O ÚLTIMO PEDAÇO DE PORTUGUÊS DE UMA PROPOSTA INGLESA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O campo saía «Time: 16h00». O «h» a separar as horas dos minutos é notação
 * portuguesa; um casal britânico lê o relógio em ciclo de doze e diz «4 p.m.» —
 * que é, aliás, como esta mesma folha já escreve a hora do cancelamento («2 p.m.
 * on the eighth working day»). Duas notações na mesma folha querem dizer que uma
 * delas está errada.
 *
 * ── PORQUE É QUE MEIO-DIA E MEIA-NOITE SÃO CASOS À PARTE ───────────────────
 *
 * «12 p.m.» é ambíguo em inglês — há quem o leia como meia-noite — e «0 a.m.»
 * não é hora nenhuma. Numa folha em que a hora é a que o casal vai usar para
 * chegar ao sítio, a ambiguidade é cara: escrevem-se por extenso.
 *
 * ── E PORQUE É QUE O QUE NÃO SE PERCEBE FICA COMO ESTAVA ───────────────────
 *
 * Reconhece-se um RELÓGIO e mais nada. Ela também escreve «ao final da tarde» ou
 * «17h às 23h», e sobre isso não há conversão que se possa fazer sem inventar:
 * uma hora inventada por nós numa proposta é pior do que uma frase portuguesa
 * escrita por ela. É a mesma regra do tipo de evento e dos convidados — traduz-se
 * o que nasceu do nosso código, e o resto é dela.
 */
function horaEmIngles(valor: string): string {
  const m = /^(\d{1,2})\s*(?:h|:|\.)\s*(\d{2})?$/i.exec(valor.trim());
  if (!m) return "";
  const horas = Number(m[1]);
  const minutos = m[2] ? Number(m[2]) : 0;
  if (horas > 23 || minutos > 59) return "";

  if (minutos === 0 && horas === 12) return "12 noon";
  if (minutos === 0 && horas === 0) return "12 midnight";

  const periodo = horas < 12 ? "a.m." : "p.m.";
  // 0 → 12, 13 → 1, 12 → 12: o ciclo de doze não tem hora zero.
  const doze = horas % 12 === 0 ? 12 : horas % 12;
  const relogio = minutos === 0 ? `${doze}` : `${doze}:${String(minutos).padStart(2, "0")}`;
  return `${relogio} ${periodo}`;
}

/** Os campos do evento que o nosso código escreve, na língua pedida. */
export type CamposDoEventoEscritos = Pick<
  ProposalDoc,
  "eventType" | "eventDate" | "ceremony" | "guests" | "time"
>;

/**
 * Os campos do evento na língua do documento — traduzidos só quando ainda são o
 * que o nosso código escreveu (ver o bloco acima).
 *
 * Em português devolve o que já lá está, sem tocar em nada: o caminho de omissão
 * não pode desenhar nada de diferente do que desenhava.
 */
export function camposDoEventoNaLingua(
  doc: CamposDoEventoEscritos,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): CamposDoEventoEscritos {
  if (idioma !== "en") return doc;
  const iso = isoDaDataPorExtenso(doc.eventDate ?? "");
  return {
    eventType: traduzido(doc.eventType ?? "", TIPOS_DE_EVENTO_EN) || doc.eventType,
    eventDate: iso ? EN.data(iso) : doc.eventDate,
    ceremony: cerimoniaEmIngles(doc.ceremony ?? "") || doc.ceremony,
    guests: traduzido(doc.guests ?? "", CONVIDADOS_EN) || doc.guests,
    time: horaEmIngles(doc.time ?? "") || doc.time,
  };
}

/**
 * O rótulo do total — o «Valor Total Decoração» que fecha o quadro quando a
 * proposta ainda não tem um total que se consiga somar.
 *
 * Também nasce escrito por nós: é o que o estúdio põe no campo ao abrir uma
 * proposta nova, e a maior parte das propostas nunca lhe toca. Continua a poder
 * ser reescrito («Investimento em flor e decor»), e aí é dela e fica.
 *
 * «Decoration Total» e não «Total Decoration», que em inglês seria uma decoração
 * completa — e acompanha o «Estimated Total» do modelo de Organização, que é o
 * rótulo do mesmo sítio na outra folha.
 */
const ROTULOS_DE_TOTAL_EN: ReadonlyMap<string, string> = new Map([
  [chaveDeRotulo("Valor Total Decoração"), "Decoration Total"],
  // O que o estúdio mostra na caixa quando ela a esvazia.
  [chaveDeRotulo("Valor Total"), "Total"],
]);

export function rotuloDoTotalNaLingua(
  doc: Pick<ProposalDoc, "totalLabel">,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): string {
  if (idioma !== "en") return doc.totalLabel;
  return traduzido(doc.totalLabel ?? "", ROTULOS_DE_TOTAL_EN) || doc.totalLabel;
}

/** O que a referência precisa de saber sobre o documento. */
export type DadosDaReferencia = CamposDoEventoEscritos & Pick<ProposalDoc, "template" | "ref">;

/**
 * A referência que corre no topo de todas as páginas de conteúdo.
 *
 * Vive aqui, e não no estúdio que a compõe, porque tem de ser composta DUAS
 * vezes: uma para a escrever no documento, em português, e outra para a desenhar
 * na língua do casal. Duas composições escritas em dois sítios divergiriam à
 * primeira mudança, e o sintoma seria uma referência que o gerador deixa de
 * reconhecer como sua — e que por isso deixa de traduzir, em silêncio.
 */
export function referenciaDoDocumento(
  doc: Omit<DadosDaReferencia, "ref"> & Pick<ProposalDoc, "clientNames">,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): string {
  const modelo = idioma === "en" ? MODELO.en : MODELO.pt;
  const campos = camposDoEventoNaLingua(doc, idioma);
  const nome = doc.template === "organizacao" ? modelo.organizacao : modelo.decoracao;
  return `${nome} ${campos.eventType} ${doc.clientNames} · ${campos.eventDate}`
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A referência a IMPRIMIR, na língua do documento.
 *
 * Só se traduz a que o estúdio compôs sozinho — a comparação é com o que a
 * composição portuguesa daria HOJE, com os campos que o documento tem hoje. Uma
 * referência escrita à mão («PO 2026-114 · Maria & Zé») não se parece com ela, e
 * sai tal e qual: é dela, e é por ela que a proposta é arquivada.
 */
export function referenciaNaLingua(
  doc: DadosDaReferencia & Pick<ProposalDoc, "clientNames">,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): string {
  if (idioma !== "en") return doc.ref;
  return doc.ref === referenciaDoDocumento(doc, "pt") ? referenciaDoDocumento(doc, "en") : doc.ref;
}

/* ═══════════════════════════════════════════════════════════════════════════
   O TEXTO PADRÃO DA CASA — E COMO SE SABE QUE CONTINUA A SER O DA CASA
   ═══════════════════════════════════════════════════════════════════════════

   As notas, as condições de reserva, as condições gerais, as observações, o
   faseamento e o cancelamento são texto FIXO — a moldura, não o conteúdo — e
   por isso traduzem-se. Só que vivem num sítio incómodo: `withProposalDefaults`
   copia-os para DENTRO do documento gravado, ao lado dos que ela reescreveu à
   mão. Depois disso, um array de condições gerais é indistinguível de outro.

   A distinção faz-se por COMPARAÇÃO: se o que está no documento é, palavra por
   palavra, o texto da casa, então é a moldura e traduz-se; se não é, é dela e
   sai tal e qual. Uma condição acrescentada, uma vírgula mudada, uma lista
   apagada — qualquer diferença e o bloco INTEIRO fica como está.

   É conservador de propósito, e na direcção certa: o pior que acontece é uma
   proposta inglesa levar um parágrafo em português que alguém escreveu à mão —
   visível, e verdadeiro, porque foi mesmo isso que ela escreveu. O contrário
   (traduzir por cima do que ela escreveu) é a proposta a dizer ao cliente uma
   coisa que ninguém leu.

   A comparação é feita com os marcadores JÁ PREENCHIDOS, porque é assim que o
   texto chega ao documento — e a versão inglesa é preenchida com a mesma
   função (ver `preencherMarcadores`), para o dia e o número de convidados
   entrarem nas duas línguas. */

/**
 * As duas condições inglesas que citam a data e o número, nas duas redacções —
 * a que cita o dado e a que se usa quando ele ainda não existe.
 *
 * As portuguesas estão em `proposal-doc.ts` (`CONDICOES_SEM_DADO`), com a razão
 * escrita por extenso: uma cláusula contratual sem o dado tem de continuar a
 * ser uma frase. Estas vivem aqui porque o inglês é deste ficheiro — escrever
 * texto inglês no módulo do documento dava duas casas para a mesma língua.
 */
const EN_CONDICAO_DO_DIA = {
  com: "This proposal is only valid for the event to be held on {DATA}.",
  sem: "This proposal is only valid for the event date that is subsequently confirmed in writing.",
} as const;
// «abaixo ou acima deste número» traduzido à letra dá «below or above that
// number», que é uma preposição a fazer de verbo. O que a cláusula diz é que
// qualquer número final diferente obriga a rever o valor — nos dois sentidos, e
// os dois têm de ficar escritos.
const EN_CONDICAO_DO_NUMERO = {
  com: "The quote is valid for the number of guests stated ({CONVIDADOS}); if the final number is lower or higher, the amount of the proposal will have to be revised.",
  sem: "The quote is valid for the number of guests subsequently confirmed in writing; if the final number is lower or higher, the amount of the proposal will have to be revised.",
} as const;

/** A chave é a frase COM marcador, e vem da mesma constante que a lista imprime:
 *  reescrever a condição inglesa não pode deixar esta tabela a apontar para uma
 *  frase que já não existe. */
const EN_CONDICOES_SEM_DADO: RedaccoesSemDado = {
  [EN_CONDICAO_DO_DIA.com]: EN_CONDICAO_DO_DIA.sem,
  [EN_CONDICAO_DO_NUMERO.com]: EN_CONDICAO_DO_NUMERO.sem,
};

/** As condições gerais da casa, em inglês. Os marcadores `{DATA}` e
 *  `{CONVIDADOS}` são os mesmos da versão portuguesa e são preenchidos com os
 *  dados do evento — que são texto dela, e portanto ficam em português. */
const EN_CONDICOES_GERAIS: string[] = [
  "VAT at the applicable legal rate is added to the amounts, as described.",
  // A portuguesa diz «terão de ser validados PELA MESMA» — pela Líquen Events,
  // nomeada na mesma frase. A inglesa dizia «subject to OUR confirmation… OUR
  // availability», e trocava de voz a meio de uma cláusula que o resto da lista
  // escreve na terceira pessoa («Líquen Events reserves the right…»). Numa folha
  // assinada, quem lê não pode ficar a adivinhar de quem é o «our».
  "Quotes sent by Líquen Events are subject to confirmation by Líquen Events when the client accepts them; the deciding factor is its availability to carry out the event.",
  "The event must be provisionally booked in writing, by email. The booking is only confirmed once the deposit has been paid.",
  "A travel charge for the Líquen team applies whenever the event takes place outside the district of Évora, based on the distance in kilometres from Évora to the venue.",
  "Whenever the distance to the venue or the event timings require the Líquen team to stay overnight, accommodation costs will be charged.",
  "A meal must be provided for the members of the Líquen team who stay for the whole event.",
  EN_CONDICAO_DO_DIA.com,
  EN_CONDICAO_DO_NUMERO.com,
  // «até 25 dias antes» é um prazo, como o do saldo: «at least», nunca «up to».
  // E «será pago o número que foi confirmado» quer dizer que se paga o número
  // confirmado MESMO que apareça menos gente — daí o «still».
  `The number of guests must be confirmed at least ${DIAS_PARA_CONFIRMAR_CONVIDADOS} days before the event. If the number of attendees on the day of the event is lower than expected, the number confirmed will still be charged. If the number of attendees is higher than the number communicated, the charge will be adjusted accordingly, and Líquen Events cannot be held responsible for any shortcomings resulting from a service provided to more attendees than were previously confirmed.`,
  "Líquen Events reserves the right to revise the price should there be significant changes in the national and/or international economic climate or in the assumptions on which this proposal was drawn up.",
];

const EN_NOTAS_IMPORTANTES: string[] = [
  "Set-up and dismantling are included in this proposal;",
  "All charges relating to the venue are the responsibility of the client or of the venue itself;",
  "The event venue and every area to be used must be handed over to us clean and ready to use;",
];

const EN_INCLUIDO: string[] = [
  "Decoration service, materials and flowers as described;",
  "Set-up and dismantling services as described.",
];

const EN_NAO_INCLUIDO: string[] = [
  "Rental and/or other costs relating to the venue, such as marquee, furniture, lounge furniture and catering tableware;",
  // O português já usa os termos ingleses da indústria — «seating chart, seating
  // plan» —, e postos lado a lado em inglês leem-se como a mesma coisa escrita
  // duas vezes. Os dois objectos que ela não fornece são as marcações de lugar e
  // o painel à entrada: em Inglaterra, «place cards» e «the table plan».
  "Favours and event stationery such as menus, place cards and the table plan.",
];

const EN_OBSERVACOES_GERAIS: string[] = [
  "Líquen Events cannot be held responsible if the event cannot take place, or has to be moved to another date, owing to significant changes in the national and/or international economic and/or social climate and/or in the event of war and/or natural disaster.",
  "All materials and props used at the event are provided for use in the decoration only.",
  "Líquen Events is a registered trademark owned by Líquen Events. All images, content, graphics, text and logo are the property of Líquen Events; all rights reserved.",
  "The content of this proposal is non-transferable, personal and confidential, and may not be reproduced or shared with third parties without the express written consent of Líquen Events.",
];

const EN_CANCELAMENTO: string[] = [
  "In the event of cancellation of the service, Líquen Events reserves the right not to refund the deposit. If the cancellation is made between the 30th day before the event and 2 p.m. on the eighth working day before the date of the event, Líquen Events is entitled to receive 70% of the total amount agreed for the event, plus the applicable VAT.",
  "If the event is cancelled after 2 p.m. on the eighth working day before the date of the event, Líquen Events is entitled to receive the full amount agreed for the event, plus VAT. In either case, the cancellation is only valid if made in writing, by email; the date and time of receipt are what count.",
  "Any dispute will be referred to the Lisbon consumer arbitration centre (Centro de Arbitragem de Conflitos de Consumo de Lisboa).",
];

/** O faseamento da casa em inglês — as duas primeiras linhas seguem a
 *  percentagem do sinal deste documento, como a versão portuguesa. */
function faseamentoEn(pctSinal: number): string[] {
  const sinal = depositPercentOf({ depositPercent: pctSinal });
  return [
    `${sinal}% on acceptance;`,
    `${100 - sinal}% ${mesesEn(MESES_ANTES_DO_SALDO)} before;`,
    // «a primeira percentagem definida» → «the first instalment above»: em
    // inglês a percentagem já está escrita duas linhas acima, e é a ela que a
    // frase aponta. E «booked», e não «considered booked», para dizer o mesmo
    // que a condição da pré-reserva diz na página anterior.
    "A booking is only confirmed once the first instalment above has been paid.",
  ];
}

/** Os blocos de texto fixo de um documento. */
export type BlocosFixos = Pick<
  ProposalDoc,
  | "notasImportantes"
  | "incluido"
  | "naoIncluido"
  | "condicoesGerais"
  | "observacoesGerais"
  | "faseamento"
  | "cancelamento"
>;

/** Duas listas com exactamente o mesmo texto, pela mesma ordem. */
function saoIguais(a: readonly string[] | undefined, b: readonly string[]): boolean {
  return !!a && a.length === b.length && a.every((s, i) => s === b[i]);
}

/**
 * Os blocos de texto fixo deste documento, na língua pedida.
 *
 * Em português devolve as MESMAS listas que estão no documento — a mesma
 * referência, sem cópia nenhuma: o caminho de omissão não pode desenhar nada de
 * diferente do que desenhava.
 *
 * Em inglês, cada bloco é traduzido apenas se for, palavra por palavra, o texto
 * da casa (ver o bloco de comentário acima). O que ela reescreveu fica como
 * está.
 */
/**
 * O texto DA CASA de cada bloco fixo, em português e no seu par inglês.
 *
 * Uma tabela e não dois sítios: há agora DUAS perguntas a fazer sobre a mesma
 * comparação — «qual é a versão inglesa deste bloco?» ({@link
 * blocosFixosNaLingua}) e «isto ainda é o texto da casa?» ({@link
 * blocoEDaCasa}) —, e as duas dependem de o par estar escrito uma vez só.
 * Escritas em dois sítios, divergiam no dia em que uma cláusula mudasse: uma
 * proposta inglesa continuaria a traduzir um texto que a outra pergunta já
 * dava por reescrito à mão.
 *
 * As redacções alternativas vão na LÍNGUA das linhas que se estão a preencher
 * — sem data, a condição inglesa tem de ser reescrita em inglês.
 *
 * E os DADOS também: a cláusula inglesa que cita o dia do evento recebe o dia
 * escrito em inglês (ver «OS CAMPOS QUE O NOSSO CÓDIGO ESCREVEU»). A
 * portuguesa recebe o que está no documento — tem de receber, porque é com ela
 * que se compara para saber se o bloco continua a ser o da casa: preencher a
 * versão de COMPARAÇÃO com a data inglesa fazia todas as condições parecerem
 * reescritas à mão, e o bloco inteiro saía em português.
 */
function textosDaCasa(
  doc: ProposalDoc,
): Record<keyof BlocosFixos, { pt: readonly string[]; en: readonly string[] }> {
  const campos = camposDoEventoNaLingua(doc, "en");
  const preencher = (
    linhas: readonly string[],
    semDado?: RedaccoesSemDado,
    dados: CamposDoEventoEscritos = doc,
  ) => linhas.map((l) => preencherMarcadores(l, dados, semDado));
  const pct = depositPercentOf(doc);
  return {
    notasImportantes: { pt: DEFAULT_NOTAS_IMPORTANTES, en: EN_NOTAS_IMPORTANTES },
    incluido: { pt: DEFAULT_INCLUIDO, en: EN_INCLUIDO },
    naoIncluido: { pt: DEFAULT_NAO_INCLUIDO, en: EN_NAO_INCLUIDO },
    condicoesGerais: {
      pt: preencher(DEFAULT_CONDICOES_GERAIS),
      en: preencher(EN_CONDICOES_GERAIS, EN_CONDICOES_SEM_DADO, campos),
    },
    observacoesGerais: { pt: DEFAULT_OBSERVACOES_GERAIS, en: EN_OBSERVACOES_GERAIS },
    faseamento: { pt: faseamentoPorOmissao(pct), en: faseamentoEn(pct) },
    cancelamento: { pt: DEFAULT_CANCELAMENTO, en: EN_CANCELAMENTO },
  };
}

/** O «a definir» de uma cláusula em inglês (A4-010). */
export const POR_DEFINIR_EN = "to be confirmed";

/**
 * Preenche uma linha das condições na língua da proposta: as redacções «sem
 * dado» dessa língua, o «a definir» dessa língua e os dados do evento
 * escritos nessa língua. Era o `preencherMarcadores` português para todas —
 * e uma proposta inglesa lia «a definir» no meio de uma cláusula em inglês.
 */
export function preencherNaLingua(
  texto: string,
  doc: ProposalDoc,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): string {
  if (idioma !== "en") return preencherMarcadores(texto, doc);
  return preencherMarcadores(
    texto,
    camposDoEventoNaLingua(doc, "en"),
    EN_CONDICOES_SEM_DADO,
    POR_DEFINIR_EN,
  );
}

export function blocosFixosNaLingua(
  doc: ProposalDoc,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): BlocosFixos {
  if (idioma !== "en") return doc;
  const casa = textosDaCasa(doc);
  /** O bloco em inglês, se o que está no documento for o da casa. */
  const naLingua = (atual: string[], campo: keyof BlocosFixos) =>
    saoIguais(atual, casa[campo].pt) ? [...casa[campo].en] : atual;
  /**
   * ── AS CONDIÇÕES COMPARAM-SE DEPOIS DE PREENCHIDAS OUTRA VEZ (A4-005) ────
   * Gravadas sem data, ficavam com a redacção «sem data»; a da casa, com a
   * data que entretanto chegou, já tem a outra. A comparação dizia «ela
   * reescreveu isto» e o bloco inteiro saía em PORTUGUÊS numa proposta
   * inglesa. Voltar a preencher o que está gravado põe os dois lados na mesma
   * redacção antes de comparar.
   *
   * E o que ela reescreveu de facto fica dela — mas o «a definir» que o
   * preenchimento português lá deixou passa a «to be confirmed».
   */
  const condicoes = (doc.condicoesGerais ?? []).map((l) => preencherMarcadores(l, doc));
  const condicoesNaLingua = saoIguais(condicoes, casa.condicoesGerais.pt)
    ? [...casa.condicoesGerais.en]
    : condicoes.map((l) => l.replaceAll(POR_DEFINIR_PT, POR_DEFINIR_EN));
  return {
    notasImportantes: naLingua(doc.notasImportantes, "notasImportantes"),
    incluido: naLingua(doc.incluido, "incluido"),
    naoIncluido: naLingua(doc.naoIncluido, "naoIncluido"),
    condicoesGerais: condicoesNaLingua,
    observacoesGerais: naLingua(doc.observacoesGerais, "observacoesGerais"),
    faseamento: naLingua(doc.faseamento, "faseamento"),
    cancelamento: naLingua(doc.cancelamento, "cancelamento"),
  };
}

/**
 * Este bloco continua a ser, palavra por palavra, o texto da casa?
 *
 * Existe para uma coisa só: a página do casal dobra as secções de condições e
 * escreve por baixo do título um resumo de uma linha do que lá está dentro.
 * Esse resumo foi escrito a olhar para o TEXTO DA CASA — «IVA, pré-reserva,
 * deslocações da equipa» —, e um resumo escrito sobre um texto que já não está
 * lá é uma mentira dita a um casal por cima de uma secção dobrada, que é o
 * pior sítio para a dizer. Onde ela reescreveu, a página conta os pontos em
 * vez de os resumir: menos útil, sempre verdade.
 *
 * A comparação é a MESMA que decide se a versão inglesa se aplica — ver
 * {@link textosDaCasa}.
 */
export function blocoEDaCasa(doc: ProposalDoc, campo: keyof BlocosFixos): boolean {
  return saoIguais(doc[campo], textosDaCasa(doc)[campo].pt);
}
