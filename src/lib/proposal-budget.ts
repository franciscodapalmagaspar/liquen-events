import {
  DEFAULT_VAT_RATE,
  resolveProposalMoney,
  type ProposalDoc,
  type ProposalMoney,
  type VatMode,
} from "./proposal-doc";
import { round2, splitSinal } from "./money";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DINHEIRO DESTE DOCUMENTO, JÁ COM A REGRA DOS ADICIONAIS APLICADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `resolveProposalMoney` sabe ler o campo do total e o modo de IVA. O que ele
 * NÃO sabe é se os valores adicionais estão dentro desse número ou se lhe
 * acrescem — isso é uma escolha por proposta (`budgetExtrasSomam`), e é esta
 * função que a aplica. Quem quiser o dinheiro efectivo de um documento chama
 * ESTA, não aquela; é a diferença entre o quadro fechar e o casal receber um
 * total que não bate certo com o sinal.
 *
 * ── COMO SE SOMA, E PORQUE É QUE NÃO SE RECALCULA TUDO ────────────────────
 * O modo «incluído» obtém o IVA por SUBTRACÇÃO, para as duas parcelas fecharem
 * o bruto ao cêntimo (a razão está escrita em `resolveProposalMoney`).
 * Recalcular `base x taxa` sobre a soma nova deitava fora esse cuidado e podia
 * mexer um cêntimo no valor que ela escreveu. Por isso a parte escrita fica
 * exactamente como estava, e o que se acrescenta é só o dos adicionais:
 *
 *     base  = base escrita  + adicionais
 *     IVA   = IVA da escrita + adicionais x taxa
 *     bruto = bruto escrito + adicionais + IVA dos adicionais
 *
 * O invariante `bruto === base + IVA` continua exacto, por construção — é
 * verificável somando as três linhas acima.
 */
export function dinheiroDaProposta(
  doc: Partial<
    Pick<
      ProposalDoc,
      | "totalAmount"
      | "totalVatMode"
      | "vatRate"
      | "totalText"
      | "totalEstimatedText"
      | "budgetExtras"
      | "budgetExtrasSomam"
    >
  >,
): ProposalMoney {
  const money = resolveProposalMoney(doc);
  if (!doc.budgetExtrasSomam) return money;
  const adicionais = somaDosExtrasSemIva(doc.budgetExtras, {
    mode: money.mode,
    vatRate: money.vatRate,
  });
  if (adicionais === 0) return money;
  const ivaDosAdicionais = round2(adicionais * money.vatRate);
  return {
    base: round2(money.base + adicionais),
    vat: round2(money.vat + ivaDosAdicionais),
    gross: round2(money.gross + adicionais + ivaDosAdicionais),
    vatRate: money.vatRate,
    mode: money.mode,
  };
}

/**
 * O ORÇAMENTO QUE SE SOMA SOZINHO.
 *
 * ── O problema ────────────────────────────────────────────────────────────
 * Palavras dela: «o Valor (sem IVA) é escrito à mão, desligado dos itens
 * acima. É uma fonte garantida de erro: altero um item e esqueço-me de
 * atualizar o total.»
 *
 * ── O que NÃO muda no PDF ─────────────────────────────────────────────────
 * As propostas reais da Líquen mostram o quadro «3. Orçamento Proposto» com a
 * coluna de preço EM BRANCO e um único «Valor Total» no fim — está assim na
 * proposta da Catarina Martins. Os preços por linha que aqui se introduzem são
 * INTERNOS: servem para somar e para avisar quando a soma e o total não batem
 * certo. O cliente continua a ver o que via.
 *
 * (Se um dia ela quiser os preços por linha impressos, é uma decisão de
 * negócio — o PDF passa a ler `budgetAmounts`. O sítio onde isso se decide é
 * `proposal-doc-pdf.ts`, não aqui.)
 *
 * ── Porque é que os preços são um array paralelo ──────────────────────────
 * `budgetItems` é `string[]` e é lido pelo desenhador do PDF, pelos documentos
 * já gravados e pelo resumo das propostas. Trocar-lhe a forma obrigava a migrar
 * tudo isso de uma vez. O array paralelo tem um risco conhecido — os índices
 * desalinharem — e é por isso que NINGUÉM mexe nos dois à mão: todas as
 * alterações passam pelos ajudantes deste ficheiro, e a leitura normaliza
 * sempre o comprimento. Um desalinhamento perde um preço; nunca parte nada.
 */

/**
 * O documento visto por quem SOMA: as linhas, os adicionais, e os campos que
 * dizem como o total se lê.
 *
 * Os campos do total são opcionais porque uma proposta a meio de ser escrita
 * ainda não tem total nenhum — e nesse caso a leitura cai no que
 * `resolveProposalMoney` decide por omissão, que é o mesmo que o PDF fará.
 */
export type DocComLinhasETotal = Pick<
  ProposalDoc,
  "budgetItems" | "budgetAmounts" | "budgetExtras"
> &
  Partial<
    Pick<
      ProposalDoc,
      /** As linhas do modelo ORGANIZAÇÃO, que são as únicas com preço IMPRESSO
       *  — ver {@link somaDasLinhasEstimadas}. Opcional porque o modelo de
       *  Decoração não as tem, e não passa a ter por isto. */
      | "budgetRows"
      | "totalAmount"
      | "totalVatMode"
      | "vatRate"
      | "totalText"
      | "totalEstimatedText"
      | "budgetExtrasSomam"
    >
  >;

/** Uma linha do orçamento, já emparelhada com o seu preço. */
export interface LinhaOrcamento {
  item: string;
  /** `null` quando ainda não tem preço — que é diferente de custar zero. */
  preco: number | null;
}

/**
 * Os pedaços de texto que se parecem com um número: "1.500", "75,00", "-500",
 * "1 500" (com espaço normal ou não separável, que é o que vem de colar de uma
 * folha de cálculo). As pontas são sempre dígitos, para não apanhar o ponto
 * final de uma frase nem a vírgula que a segue.
 *
 * É a MESMA forma que o `parseMoneyText` do `proposal-doc.ts` usa, e é de
 * propósito: dois leitores do mesmo texto que discordam do número são um
 * defeito, não uma escolha.
 */
const CORRIDA_NUMERICA = /-?\d(?:[\d.,\s\u00a0]*\d)?/g;

/**
 * "1.500", "1500", "1 500 €", "1.500,50" → 1500 / 1500 / 1500 / 1500.5
 *
 * Ela escreve os valores de maneiras diferentes conforme a pressa, e a
 * missão pede que isto se normalize sozinho. As regras seguem o português:
 * a vírgula é o decimal, o ponto separa milhares.
 *
 * ── PORQUE É QUE UM TEXTO COM DOIS NÚMEROS NÃO SE LÊ ──────────────────────
 *
 * Isto começava por deitar fora tudo o que não fosse dígito, vírgula, ponto ou
 * sinal. Parece inofensivo e não é: deitar fora as LETRAS COLA os dígitos que
 * estavam à volta delas. Medido, num documento de base 10.000 €:
 *
 *     "de 800 a 1.200 €"          →  8.001.200,00 €   (oito milhões)
 *     "1.500 € + 23% IVA"         →          1,50 €   (perde 1.498,50 €)
 *     "2 x 450,00 €"              →      2.450,00 €
 *     "75,00 € (Évora, 120 km)"   →           null    (duas vírgulas ⇒ NaN)
 *
 * Os três primeiros são a pior avaria que este ficheiro pode ter: um número
 * inventado, sem aviso nenhum, a viajar para o PDF, para a página do casal,
 * para o corpo do email, para o sinal e para a factura.
 *
 * A regra passa a ser simples e recusa-se a adivinhar: **uma corrida numérica
 * lê-se; duas ou mais não se lêem.** Um valor com um número só («896,00 €»,
 * «1 500 €», «-500,00 €») continua exactamente como estava. Um valor com dois
 * («de 800 a 1.200 €», «2 x 450,00 €») é um intervalo, uma multiplicação ou
 * uma ressalva — coisas que ninguém consegue somar sem adivinhar qual dos
 * números conta.
 *
 * E não se cala: o {@link textoTemNumeroQueNaoSeLe} diz que aquilo TINHA um
 * número, e o {@link totaisDaProposta} usa-o para escrever, no aviso, qual é a
 * linha que não entra na soma. É a diferença entre um valor deliberadamente «a
 * definir» e um valor que ela escreveu a contar que fosse somado.
 */
export function normalizarValor(texto: unknown): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null;
  if (typeof texto !== "string") return null;

  const corridas = texto.match(CORRIDA_NUMERICA);
  // Nenhum número («a definir», «sob consulta») ou mais do que um: não se lê.
  if (!corridas || corridas.length !== 1) return null;

  // Fora os espaços (normais e não separáveis) de dentro do próprio número.
  const limpo = corridas[0].replace(/[\s ]/g, "");
  if (!limpo) return null;

  let normalizado: string;
  if (limpo.includes(",")) {
    // Há vírgula: ela é o decimal, e os pontos são milhares.
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else {
    const partes = limpo.split(".");
    // "1.500" é mil e quinhentos; "1.5" é um e meio. A diferença é o
    // comprimento do último grupo — três dígitos são um separador de milhares.
    // Sem esta regra, escrever "1.500" dava um total de 1,50 € e a proposta
    // saía com o preço de um café.
    const ultimoEhMilhar = partes.length > 1 && partes[partes.length - 1].length === 3;
    normalizado = partes.length === 1 || ultimoEhMilhar ? partes.join("") : limpo;
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/**
 * «Isto tinha um número lá dentro e mesmo assim não se conseguiu ler.»
 *
 * Serve para distinguir as duas ausências que hoje se parecem uma com a outra
 * na coluna do dinheiro: «a definir» (deliberado, e está tudo bem) de «de 800
 * a 1.200 €» (ela escreveu um valor a contar que contasse, e não conta).
 * Só a segunda merece um aviso.
 */
export function textoTemNumeroQueNaoSeLe(texto: unknown): boolean {
  if (typeof texto !== "string") return false;
  if (normalizarValor(texto) !== null) return false;
  return /\d/.test(texto);
}

/** Os preços, sempre com o mesmo comprimento que as linhas. */
export function precosDe(
  doc: Pick<ProposalDoc, "budgetItems" | "budgetAmounts">,
): (number | null)[] {
  const n = doc.budgetItems?.length ?? 0;
  const guardados = doc.budgetAmounts ?? [];
  return Array.from({ length: n }, (_, i) => {
    const v = guardados[i];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  });
}

/** As linhas com os preços ao lado, que é como a interface as desenha. */
export function linhasDe(
  doc: Pick<ProposalDoc, "budgetItems" | "budgetAmounts">,
): LinhaOrcamento[] {
  const precos = precosDe(doc);
  return (doc.budgetItems ?? []).map((item, i) => ({ item, preco: precos[i] }));
}

/**
 * Os valores adicionais que se conseguem LER, em euros.
 *
 * São texto livre no documento ("896,00 €", "895,00 € + IVA", "a definir",
 * "sob consulta") porque é assim que aparecem nas propostas verdadeiras. O que
 * tem um número conta; o resto não conta e também não estraga nada.
 */
function valoresDosExtras(extras: ProposalDoc["budgetExtras"]): number[] {
  return (extras ?? [])
    .map((e) => normalizarValor(e.valueText))
    .filter((p): p is number => p !== null);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO VALEM OS «VALORES ADICIONAIS»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «nós colocámos a deslocação da equipa Líquen, que são mil
 * quinhentos e cinquenta euros, e ele depois no total não soma o valor total
 * que nós estamos a colocar. Eu quero que o back office tenha inteligência
 * suficiente para ver os valores que nós colocamos em cada aba e faça a soma.»
 *
 * Tinha razão, e o problema era maior do que o ecrã: o total era também o
 * PREÇO FINAL do pedido, e é dele que saem a factura, o sinal de 30% e o saldo.
 * Uma deslocação de 1.550 € escrita como valor adicional saía da proposta para
 * o cliente, e não entrava em nada do que se cobra — o sinal era calculado sem
 * ela e a factura era emitida sem ela.
 *
 * Devolve `0` quando não há nenhum valor legível, que é o que permite somá-lo
 * sempre sem perguntar primeiro.
 */
export function somaDosExtras(extras: ProposalDoc["budgetExtras"]): number {
  const valores = valoresDosExtras(extras);
  if (valores.length === 0) return 0;
  return round2(valores.reduce((a, b) => a + b, 0));
}

/**
 * O que a PRÓPRIA linha declara sobre o IVA, ou `null` quando não declara nada.
 *
 * Não é o `detectVatMode` do `proposal-doc`: esse responde sempre, e responde
 * «incluído» quando o texto está calado — o que é a leitura certa para o total
 * escrito à mão e a errada para uma linha, porque uma linha calada não está a
 * dizer «com IVA», está a não dizer nada. A diferença entre «não diz» e «diz
 * incluído» é o que permite cair para o modo do DOCUMENTO em vez de adivinhar.
 */
function modoDeIvaDaLinha(texto: string | undefined): "acrescer" | "incluido" | null {
  if (!texto) return null;
  const t = texto.toLowerCase();
  if (/\+\s*iva|mais\s+iva|acresce\s+(?:o\s+)?iva|iva\s+n[aã]o\s+inclu|s\/\s*iva|sem\s+iva/.test(t))
    return "acrescer";
  if (/iva\s+inclu|c\/\s*iva|com\s+iva/.test(t)) return "incluido";
  return null;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO É QUE OS ADICIONAIS ACRESCENTAM À BASE — LENDO O IVA QUE ELES DIZEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O campo do total no estúdio chama-se «Preço final (SEM IVA)»: é a base
 * tributável, e é dela que saem a factura, o sinal e o saldo. Os adicionais são
 * texto livre, e nas propostas verdadeiras aparecem das duas maneiras —
 * «895,00 € + IVA» e «895,00 €».
 *
 * A soma tratava-as exactamente da mesma maneira: pegava no número e somava-o à
 * base. Para «895,00 € + IVA» isso está certo — o texto diz que 895 é líquido.
 * Para «895,00 €» numa proposta que se lê COM IVA, está errado: a linha promete
 * ao casal que aquilo custa 895, e o total sobe 895 de base, ou seja 1.101 do
 * que eles vão pagar. A linha e o total dizem números diferentes sobre a mesma
 * coisa, no mesmo documento.
 *
 * A regra, por ordem:
 *   1. o que a linha DIZ ganha sempre («+ IVA» ⇒ líquido, «IVA incluído» ⇒
 *      bruto). É a intenção escrita por quem a escreveu;
 *   2. uma linha calada segue o modo do DOCUMENTO — é a leitura que o casal vai
 *      fazer, porque é a que está impressa ao lado do total;
 *   3. sem contexto nenhum, líquido, que é o comportamento de sempre.
 *
 * Devolve SEMPRE base (sem IVA), para poder ser somado ao campo do total sem
 * mais conversões.
 */
export function somaDosExtrasSemIva(
  extras: ProposalDoc["budgetExtras"],
  contexto?: { mode?: "acrescer" | "incluido"; vatRate?: number },
): number {
  const taxa =
    typeof contexto?.vatRate === "number" && contexto.vatRate >= 0
      ? contexto.vatRate
      : DEFAULT_VAT_RATE;
  // Soma-se tudo em vírgula flutuante e arredonda-se UMA vez, no fim.
  // Arredondar cada linha ao converter deixava a soma de três adicionais a
  // divergir da conversão da soma — e é a soma que vai para o total.
  const total = (extras ?? []).reduce((acc, e) => {
    const valor = normalizarValor(e.valueText);
    if (valor === null) return acc;
    const modo = modoDeIvaDaLinha(e.valueText) ?? contexto?.mode ?? "acrescer";
    // Bruto → base. Nunca o contrário: o que se soma é sempre a base.
    return acc + (modo === "incluido" ? valor / (1 + taxa) : valor);
  }, 0);
  return round2(total);
}

/**
 * A RESSALVA que ela escreveu num valor — o que lá está além do número e além
 * do IVA.
 *
 *   «12.500,00 € + IVA (a confirmar consoante a distância final)»
 *       → «a confirmar consoante a distância final»
 *   «950,50 € + IVA»  → «»   (não há ressalva; não se imprime nada)
 *   «12.500,00 €»     → «»
 *
 * Três coisas caem, por esta ordem, e cada uma por uma razão diferente:
 *
 *  1. O NÚMERO — com os separadores e a moeda que venha agarrada. Vai para a
 *     coluna da direita, na unidade do bloco, e não se repete no nome.
 *  2. O «+ IVA». Não se perde nada: a escada por baixo diz «TOTAL (sem IVA)»,
 *     «IVA (23%)» e «Total a pagar», que é a mesma informação dita pelas nossas
 *     contas e não por um pedaço de texto livre. E há uma razão dura para o
 *     tirar: numa proposta INGLESA, o «+ IVA» dela chegava ao papel em português
 *     por cima de uma folha que diz «VAT».
 *  3. Os parênteses à volta do que sobra, se ela já lá os tiver posto — senão
 *     saía «(( a confirmar ))».
 *
 * O que fica é a CONDIÇÃO, que é a única parte que só ela sabe e que o documento
 * não diz por si. Não se interpreta: só se separa.
 *
 * Vivia dentro do `proposal-doc-pdf.ts`, como fecho local. Mudou-se para aqui
 * sem uma vírgula de diferença porque a PÁGINA passou a precisar exactamente da
 * mesma regra — ver {@link valorAdicionalParaOEcra}.
 */
export function ressalvaDoValor(texto: string | undefined): string {
  const semNumero = (texto ?? "")
    .trim()
    .replace(/^[^\d+-]*[-+]?\d[\d\s.,\u00a0]*\s*(€|eur(?:os?)?)?\s*/i, "")
    .trim();
  const semIva = semNumero.replace(/^[+\s]*(iva|vat)\b\s*/i, "").trim();
  const sobra = semIva.replace(/^[\s,;:·—–-]+/u, "").trim();
  return /^\([\s\S]*\)$/.test(sobra) ? sobra.slice(1, -1).trim() : sobra;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM VALOR ADICIONAL, PRONTO A DESENHAR — NA UNIDADE DA ESCADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O PDF já fazia isto bem e tinha a razão escrita ao lado: o que vai na coluna
 * do dinheiro é a BASE (`somaDosExtrasSemIva`), nunca o número cru que ela
 * escreveu. «75,00 €» numa proposta que se lê COM IVA vale 60,98 € de base, e
 * imprimir 75,00 ao lado de um subtotal de 2.399,02 € era pôr uma parcela que
 * não soma com as outras.
 *
 * A página do casal não fazia. Imprimia o texto cru, e a coluna ficava assim:
 *
 *     Subtotal dos serviços        2.399,02 €
 *     Deslocação da Equipa Líquen     75,00 €
 *     TOTAL (sem IVA)              2.460,00 €
 *
 * 2.399,02 + 75,00 = 2.474,02, e a folha diz 2.460,00. Catorze euros que a
 * página não explica — na página onde o casal decide dizer que sim. O PDF do
 * mesmo documento estava certo, o que é pior: as duas folhas discordavam.
 *
 * Devolve as duas metades da decisão, para o desenho não a repetir:
 *  · `montante` — o que soma, em base. `null` quando o valor não se lê
 *    (ver {@link normalizarValor}), e aí a coluna imprime «—».
 *  · `aoLado` — o que ela escreveu que NÃO é o número: a ressalva quando o
 *    número cru bate certo com a base, e o texto inteiro quando não bate (é a
 *    forma de a folha dizer os dois números em vez de esconder um deles).
 */
export function valorAdicionalParaOEcra(
  extra: { label?: string; valueText?: string },
  contexto?: { mode?: "acrescer" | "incluido"; vatRate?: number },
): { montante: number | null; mostraTudo: boolean; escrito: string; ressalva: string } {
  const cru = normalizarValor(extra.valueText);
  const base = somaDosExtrasSemIva(
    [{ label: extra.label ?? "", valueText: extra.valueText ?? "" }],
    contexto,
  );
  const escrito = (extra.valueText ?? "").trim();
  // `mostraTudo` e não `aoLado` já formatado: o PDF passa o texto dela por um
  // conversor de língua antes de o desenhar e a página não. A DECISÃO é que tem
  // de ser a mesma nos dois sítios; a formatação é de cada folha.
  return {
    montante: cru === null ? null : base,
    mostraTudo: cru === null || round2(cru) !== base,
    escrito,
    ressalva: ressalvaDoValor(escrito),
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COLUNA QUE O CASAL SOMA — E QUE NINGUÉM SOMAVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O QUE SAIU IMPRESSO ───────────────────────────────────────────────────
 * Numa proposta do modelo ORGANIZAÇÃO gerada a sério, com quatro rubricas, a
 * folha do orçamento dizia — nesta coluna, por esta ordem:
 *
 *     Coordenação e planeamento integral    6.500,00 €
 *     Coordenação no dia do evento          1.850,00 € + IVA (a confirmar)
 *     Gestão de fornecedores e contratos    —
 *     Assessoria de imagem e papelaria
 *     TOTAL (sem IVA)                      12.500,00 €
 *
 * 6.500 + 1.850 = 8.350. O total impresso são 12.500 — 4.150 € que a coluna
 * não explica. As duas rubricas por orçamentar SÃO a diferença, mas isso não
 * está escrito em lado nenhum: quem somar a coluna encontra um buraco e não
 * tem como saber se é um preço que falta ou uma conta que está errada.
 *
 * ── PORQUE É QUE NÃO HAVIA AVISO ──────────────────────────────────────────
 * `budgetRows` era lido NUM SÍTIO SÓ — a desenhar — e este ficheiro não tinha
 * uma única ocorrência do nome. O modelo de DECORAÇÃO não pode ter este
 * defeito: lá o subtotal é DERIVADO do total (`servicos = base − adicionais`)
 * e a coluna de preços sai em branco, portanto não há dois números para
 * divergirem. No de Organização há: valores escritos à mão numa coluna, e um
 * total escrito à mão vinte pontos por baixo dela.
 *
 * ── O QUE SE COMPARA, E CONTRA O QUÊ ──────────────────────────────────────
 * A coluna contra o SUBTOTAL (`servicos`), que é onde o quadro fecha por cima
 * dos valores adicionais. É a mesma escolha do {@link desalinhamento} e pela
 * mesma razão: os adicionais são impressos POR BAIXO do subtotal, em linhas
 * próprias, e se só um dos lados os perdesse uma proposta certa passava a
 * acusar a deslocação inteira de diferença.
 *
 * Os preços são TEXTO LIVRE («1.850,00 € + IVA (a confirmar)»), como os
 * valores adicionais, e por isso são lidos pela MESMA regra
 * ({@link somaDosExtrasSemIva}): o que a linha diz ganha, uma linha calada
 * segue o modo do documento, e o resultado é sempre BASE — que é a unidade em
 * que `servicos` está. Medido no caso simétrico: com uma leitura crua, uma
 * proposta certa que se lê COM IVA (8.350 de base, 10.270,50 impressos)
 * acusava 1.150 € de diferença que não existem.
 *
 * ── E QUANDO É QUE SE CALA ────────────────────────────────────────────────
 * `null` — nada a dizer — quando NENHUMA rubrica tem preço legível. Essa é a
 * folha de sempre: as rubricas por nome e a coluna em branco, como na proposta
 * feita à mão e como o modelo de Decoração sai todos os dias. Sem um número
 * impresso não há nada que contradiga o total, e, nas palavras dela, «um aviso
 * que dispara em condições normais é um aviso que se aprende a ignorar».
 *
 * `semPreco` conta as rubricas que o casal vê SEM valor ao lado — é essa a
 * frase que falta no papel, e é por isso que o aviso a diz.
 */
export function somaDasLinhasEstimadas(
  doc: Pick<ProposalDoc, "budgetRows">,
  contexto?: { mode?: VatMode; vatRate?: number },
): { soma: number; comPreco: number; semPreco: number } | null {
  // Uma linha sem nome NEM preço não chega ao papel como coisa nenhuma, e por
  // isso não conta para «rubricas sem preço» — que é uma frase sobre o que o
  // casal vê, não sobre o que está guardado.
  const linhas = (doc.budgetRows ?? []).filter(
    (r) => (r?.item ?? "").trim() !== "" || (r?.price ?? "").trim() !== "",
  );
  // O marcador «[Valor]» não tem número nenhum lá dentro, e por isso cai aqui
  // do lado certo: é uma rubrica SEM preço, que é o que ela é no papel (o
  // desenho imprime-lhe um «—»).
  const comNumero = linhas.filter((r) => normalizarValor(r.price) !== null);
  if (comNumero.length === 0) return null;
  return {
    soma: somaDosExtrasSemIva(
      comNumero.map((r) => ({ label: r.item, valueText: r.price })),
      contexto,
    ),
    comPreco: comNumero.length,
    semPreco: linhas.length - comNumero.length,
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SOMA DOS SERVIÇOS — E SÓ DELES. OS ADICIONAIS NÃO ENTRAM AQUI.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta é a resposta a UMA pergunta: «quanto valem os serviços que estão
 * listados no orçamento?». É a soma que o rótulo «Soma das linhas» promete, e é
 * o lado esquerdo da comparação com o total.
 *
 * ── PORQUE É QUE OS ADICIONAIS SAÍRAM DAQUI ───────────────────────────────
 * Entravam. E a dona do negócio abriu uma proposta que estava certa — quatro
 * serviços ainda por orçamentar, uma deslocação de 75,00 €, total escrito
 * 2.460,00 € — e leu «o total está escrito à mão e difere da soma das linhas em
 * 2.385,00 €». O aviso estava a comparar 2.460 € com 75 €: os quatro serviços
 * não tinham preço nenhum (o «900» a cinzento é um placeholder do campo) e a
 * única coisa legível no orçamento inteiro era a deslocação. Chamar 75,00 € «a
 * soma das linhas» num documento de 2.460 € é dizer um número que não existe.
 *
 * A pergunta «os adicionais entram na soma?» esteve em aberto com ela (fim de
 * `PROPOSTAS-O-QUE-MELHORAR.md`) e está respondida: NÃO entram. Palavras dela —
 * «um aviso que dispara em condições normais é um aviso que se aprende a
 * ignorar».
 *
 * ── E O `null` ────────────────────────────────────────────────────────────
 * `null` quando NENHUM serviço tem preço — que é diferente de somar zero. Sem
 * esta distinção, uma proposta ainda por orçamentar dizia «a soma das linhas é
 * 0,00 €» e o aviso aparecia em todas as propostas desde o primeiro segundo.
 * Note-se que a condição é sobre os SERVIÇOS: um adicional legível já não chega
 * para haver soma, e é exactamente isso que cala o aviso no caso acima.
 *
 * Os preços por linha são sempre líquidos — são campos numéricos, sem IVA
 * nenhum escrito ao lado —, por isso esta soma é BASE e compara-se com base.
 */
export function somaDosServicos(
  doc: Pick<ProposalDoc, "budgetItems" | "budgetAmounts">,
): number | null {
  const dosServicos = precosDe(doc).filter((p): p is number => p !== null);
  if (dosServicos.length === 0) return null;
  // Arredondar ao cêntimo: somar floats dá 3249.9999999999995.
  return round2(dosServicos.reduce((a, b) => a + b, 0));
}

/**
 * @deprecated O nome não diz de que «itens» se trata, e a resposta certa
 * depende disso. Use {@link somaDosServicos} (só os serviços, para comparar com
 * o total) ou {@link somaDosServicosEAdicionais} (o que o campo do total devia
 * dizer). Fica só porque ainda é lido em `ProposalStudio.tsx`.
 */
export const somaDosItens = somaDosServicos;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O CAMPO DO TOTAL DEVIA DIZER — AÍ SIM, COM OS ADICIONAIS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Outra pergunta, outra função — de propósito, e não a de cima com uma
 * bandeira. Aqui a pergunta é «que número devia estar escrito no Preço final?»,
 * e a resposta TEM de incluir os adicionais: o campo do total é também o preço
 * final do pedido, e é dele que saem a factura, o sinal e o saldo. Mexer num
 * adicional já mexe no total (ver `definirExtras` no estúdio); esta função é o
 * mesmo número visto do outro lado, para o botão «Usar X» poder oferecer um
 * total que não deixa a deslocação de fora.
 *
 * Os adicionais passam por {@link somaDosExtrasSemIva} e não pelo número cru:
 * são texto livre, e «895,00 € + IVA» e «895,00 €» querem dizer coisas
 * diferentes. Numa proposta que se lê COM IVA, somar 1.550 crus a um campo que
 * é base promete 1.550 na linha e cobra 1.906,50 ao casal.
 *
 * `null` na mesma condição da soma dos serviços — sem serviços com preço não há
 * total nenhum a sugerir.
 */
export function somaDosServicosEAdicionais(doc: DocComLinhasETotal): number | null {
  const dosServicos = somaDosServicos(doc);
  if (dosServicos === null) return null;
  // O mesmo modo e a mesma taxa por que o total é lido — sem isso, os dois
  // lados da comparação saem de leituras diferentes do mesmo documento.
  const { mode, vatRate } = resolveProposalMoney(doc);
  return round2(dosServicos + somaDosExtrasSemIva(doc.budgetExtras, { mode, vatRate }));
}

/**
 * O total está desalinhado da soma dos serviços?
 *
 * Devolve `null` quando não há nada a dizer, e são três casos: nenhum serviço
 * com preço (não há soma para comparar), o total a bater certo, ou a diferença
 * a caber na tolerância de um cêntimo — que existe porque a soma é feita em
 * vírgula flutuante e o total foi escrito por uma pessoa.
 *
 * ── OS DOIS LADOS SÃO «SÓ SERVIÇOS» ───────────────────────────────────────
 * `base` é o total ESCRITO, e esse já traz os adicionais lá dentro (mexer num
 * adicional mexe no total). Se só a soma perdesse os adicionais, uma proposta
 * certa com uma deslocação de 1.550 € passava a acusar 1.550 € de diferença —
 * trocava-se um aviso falso por outro. Por isso tira-se o mesmo dos dois lados:
 * `total` é a parte do total que cabe aos serviços, que é exactamente o número
 * que o PDF imprime na linha «Valor Total» (ver `proposal-doc-pdf.ts`).
 *
 * A diferença dá o mesmo dos dois modos de olhar — `(base − adicionais) −
 * serviços` é `base − (serviços + adicionais)` —, e é isso que permite oferecer
 * `sugerido` sem contradizer o que está escrito ao lado.
 */
export function desalinhamento(
  doc: DocComLinhasETotal,
  base: number,
): { soma: number; total: number; diferenca: number; sugerido: number } | null {
  const soma = somaDosServicos(doc);
  if (soma === null) return null;
  const { mode, vatRate } = resolveProposalMoney(doc);
  /**
   * Quando os adicionais SOMAM ao valor escrito, o campo do total já é só
   * serviços: tirar-lhe os adicionais tirava-os duas vezes, e uma proposta
   * certa passava a acusar a deslocação inteira de diferença. Quem chama passa
   * a base efectiva (`dinheiroDaProposta(doc).base`), que nesse modo já traz os
   * adicionais lá dentro — a subtracção volta a ser a mesma nos dois casos.
   */
  const dosAdicionais = somaDosExtrasSemIva(doc.budgetExtras, { mode, vatRate });
  const total = round2(base - dosAdicionais);
  const diferenca = round2(total - soma);
  if (Math.abs(diferenca) <= 0.01) return null;
  // `sugerido` e não `soma`: quem carrega em «Usar X» escreve no campo do
  // total, e esse campo inclui os adicionais. Oferecer a soma dos serviços
  // apagava a deslocação do preço final — e com ela do sinal e da factura.
  // `sugerido` é o que se escreve NO CAMPO ao carregar em «Usar X», e o campo
  // muda de significado com o modo: com os adicionais lá dentro é a soma mais
  // eles; com os adicionais a somar por fora é só a soma dos serviços.
  const sugerido = doc.budgetExtrasSomam ? soma : round2(soma + dosAdicionais);
  return { soma, total, diferenca, sugerido };
}

/**
 * Sinal e saldo, a partir do total e da percentagem do sinal.
 *
 * Delega em {@link splitSinal}, e é de propósito que não repete a conta: eram
 * duas implementações da mesma divisão — esta e a de `money.ts` — e enquanto
 * foram duas podiam arredondar para lados diferentes. O sinal que o estúdio
 * mostra tem de ser, ao cêntimo, o sinal que a factura emite; se forem duas
 * funções, um dia deixam de ser o mesmo número e ninguém dá por isso até um
 * cliente perguntar.
 */
export function sinalESaldo(
  total: number,
  percentagemSinal: number,
): { sinal: number; saldo: number } {
  return splitSinal(total, percentagemSinal);
}

/** As duas leituras do mesmo número, para ela ver o que o cliente vai ver. */
export function asDuasFormas(
  base: number,
  taxa: number,
): {
  acrescer: { base: number; iva: number; total: number };
  incluido: { base: number; iva: number; total: number };
} {
  const cent = round2;
  // O valor escrito primeiro ao cêntimo, e só depois multiplicado. Com uma base
  // a chegar com mais de dois decimais (1,005 €), `cent(base × taxa)` e
  // `cent(cent(base) × taxa)` divergem em cerca de 6% dos valores medidos
  // (11.500 em 200.000) — e o quadro mostrava um IVA que não é o da base que
  // mostra ao lado. Um valor em euros tem cêntimos e mais nada.
  const b = cent(base);
  // "acresce": o número escrito é a base e o IVA soma-se por cima.
  const ivaAcrescer = cent(b * taxa);
  // "incluído": o número escrito JÁ traz o IVA lá dentro, e a base extrai-se.
  const baseIncluido = cent(b / (1 + taxa));
  // Nos dois casos o IVA sai por SUBTRACÇÃO ou o total por SOMA das parcelas
  // já arredondadas — nunca as três por sua conta. É o que garante que estas
  // duas leituras, que existem para ela comparar, fecham cada uma em si.
  return {
    acrescer: { base: b, iva: ivaAcrescer, total: cent(b + ivaAcrescer) },
    incluido: { base: baseIncluido, iva: cent(b - baseIncluido), total: b },
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS SEIS NÚMEROS DO BLOCO DE TOTAIS — CALCULADOS UMA VEZ, TODOS DA MESMA BASE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O que estava errado, medido na proposta da Tara e do Marty (14 páginas) ─
 * O documento que foi para a cliente dizia, em três folhas diferentes:
 *
 *     página 11   Valor Total                  2.950,79 €
 *     página 11   Deslocação da Equipa Líquen      75,00 €
 *     página 14   Sinal 30%                       907,74 €
 *     página 14   Saldo 70%                     2.118,06 €
 *
 * O sinal e o saldo somam 3.025,80 € — que é 2.460,00 × 1,23, ou seja o total
 * COM IVA. O «Valor Total» saiu também com IVA (daí ter desaparecido o «+ IVA»
 * ao lado dele) mas SEM a deslocação, e ainda por cima com um cêntimo a menos:
 * 2.950,79 + 75,00 = 3.025,79 ≠ 3.025,80. O documento não fechava.
 *
 * O cêntimo perdia-se numa DUPLA CONVERSÃO feita no gerador: pegava-se no
 * bruto guardado (3.025,80), dividia-se por 1,23 para obter a base (2.460,00),
 * tirava-se a deslocação já convertida à parte (75 ÷ 1,23 = 60,98, arredondada
 * ali), e o que sobrava (2.399,02) era MULTIPLICADO outra vez por 1,23 para ser
 * impresso — 2.950,79 em vez de 2.950,80. Duas conversões e dois
 * arredondamentos para chegar a um número que se obtém por uma subtracção.
 *
 * ── A regra ───────────────────────────────────────────────────────────────
 * Uma conversão de unidade por número, feita UMA vez, a partir do valor
 * guardado. Aqui só há uma: a que {@link resolveProposalMoney} faz entre
 * `totalAmount` e o par base/bruto. Tudo o resto são somas e subtracções DENTRO
 * da base — e o bruto sai de `base + IVA`, nunca de multiplicar um número que
 * já foi impresso.
 *
 * ── Porque é que os seis saem juntos ──────────────────────────────────────
 * Palavras dela: «um bloco de totais inequívoco». Os seis números são um só
 * raciocínio, e enquanto foram seis contas espalhadas por duas páginas do
 * gerador puderam — e chegaram a — sair em unidades diferentes. Saem daqui, de
 * uma vez, e quem os desenha não faz contas nenhumas.
 */
export interface TotaisDaProposta {
  /** Subtotal dos serviços listados, SEM IVA. É o total menos os adicionais. */
  servicos: number;
  /** O que os valores adicionais acrescentam à base — ver {@link somaDosExtrasSemIva}. */
  adicionais: number;
  /** O TOTAL: a base sobre a qual tudo o resto é calculado. */
  total: number;
  iva: number;
  /** O que o casal transfere ao todo: `total + iva`. */
  aPagar: number;
  sinal: number;
  saldo: number;
  /** A percentagem do sinal, tal como foi pedida. */
  percentagemSinal: number;
  taxa: number;
  modo: VatMode;
  /**
   * As somas do documento fecham ao cêntimo?
   *
   * Por construção fecham sempre — é essa a razão de ser deste objecto. Fica
   * verificado à mesma porque o dia em que deixar de fechar é o dia em que
   * alguém volta a converter um número já impresso, e esse dia não pode passar
   * despercebido. Ver {@link porQueNaoFecha}.
   */
  fecha: boolean;
  /** O que não fecha, em pt-PT, para quem gera a proposta poder ser avisado.
   *  Vazio quando está tudo bem, que é o caso normal. */
  porQueNaoFecha: string[];
}

/**
 * Os seis números do bloco de totais, mais o sinal e o saldo.
 *
 * `percentagemSinal` vem de fora (`depositPercentOf`) de propósito: é ela que a
 * facturação lê, e as duas leituras têm de ser a mesma — o sinal impresso no
 * documento que o casal aceita é o sinal que a factura emite.
 *
 * ── O SUBTOTAL DOS SERVIÇOS NÃO É A SOMA DAS LINHAS ───────────────────────
 * As propostas verdadeiras da Líquen mostram o quadro com a coluna de preço EM
 * BRANCO (ver o cabeçalho deste ficheiro): os preços por linha são internos e
 * na maioria das propostas nem existem. O subtotal é, por isso, o que SOBRA do
 * total depois de tirar os adicionais — que é exactamente o que a folha feita à
 * mão chama «Valor Total» e põe por cima da deslocação.
 *
 * Pode dar NEGATIVO, e sai negativo: acontece quando os adicionais escritos
 * valem mais do que o total, ou seja quando o total ficou por actualizar. Havia
 * aqui um `Math.max(0, …)` que o escondia, e escondê-lo custava o fecho do
 * bloco — o subtotal e os adicionais deixavam de somar o total, em silêncio.
 * Um número estranho que se vê e se avisa corrige-se; uma soma que não fecha
 * chega ao casal.
 */
export function totaisDaProposta(
  doc: DocComLinhasETotal,
  percentagemSinal: number,
): TotaisDaProposta {
  /**
   * `dinheiroDaProposta` e não `resolveProposalMoney`: é aqui que a escolha
   * «os adicionais somam ao valor escrito» entra nas contas. O `servicos`
   * abaixo continua a ser `base - adicionais` nos DOIS modos, e dá o número
   * certo em ambos — quando os adicionais somam, a base já os traz, e a
   * subtracção devolve exactamente o valor que ela escreveu.
   */
  const money = dinheiroDaProposta(doc);
  const adicionais = somaDosExtrasSemIva(doc.budgetExtras, {
    mode: money.mode,
    vatRate: money.vatRate,
  });
  // Uma subtracção dentro da base. Não há aqui conversão nenhuma: a única que o
  // documento faz é a que já veio feita em `money`.
  const servicos = round2(money.base - adicionais);
  const { sinal, saldo } = splitSinal(money.gross, percentagemSinal);

  const porQueNaoFecha: string[] = [];
  if (round2(servicos + adicionais) !== money.base) {
    porQueNaoFecha.push(
      `o subtotal dos serviços e os valores adicionais não somam o total (${servicos} + ${adicionais} ≠ ${money.base})`,
    );
  }
  if (round2(money.base + money.vat) !== money.gross) {
    porQueNaoFecha.push(
      `o total e o IVA não somam o total a pagar (${money.base} + ${money.vat} ≠ ${money.gross})`,
    );
  }
  if (round2(sinal + saldo) !== money.gross) {
    porQueNaoFecha.push(
      `o sinal e o saldo não somam o total a pagar (${sinal} + ${saldo} ≠ ${money.gross})`,
    );
  }
  if (servicos < 0) {
    porQueNaoFecha.push(
      `os valores adicionais (${adicionais}) valem mais do que o total (${money.base}), e o subtotal dos serviços sai negativo`,
    );
  }
  /**
   * ── O TOTAL A PAGAR NÃO PODE SER NEGATIVO ────────────────────────────────
   *
   * Um desconto escrito como valor adicional («−12.000,00 €» sobre uma base de
   * 10.000 €) fazia o PDF desenhar a escada inteira com o número grande a dizer
   * «Total a pagar −2.460,00 €», enquanto a página do casal escondia o quadro
   * todo (a condição dela é `aPagar > 0`). Duas folhas do mesmo documento, uma
   * com seis números negativos e a outra sem números nenhuns.
   *
   * O aviso já disparava, mas pela via errada — queixava-se do sinal e do saldo
   * («0 + 0 ≠ −2460»), que é o SINTOMA. Isto nomeia a causa, e é o que o desenho
   * passa a ler para decidir não imprimir a escada.
   */
  if (money.gross < 0) {
    porQueNaoFecha.push(
      `o total a pagar é negativo (${money.gross}) — um desconto maior do que o valor dos serviços não é um preço`,
    );
  }
  /**
   * ── OS VALORES ADICIONAIS QUE TÊM UM NÚMERO E NÃO SE SOMAM ──────────────
   *
   * «de 800 a 1.200 €», «2 x 450,00 €», «75,00 € (Évora, 120 km)». Ver
   * {@link normalizarValor}: um texto com dois números não se lê, de propósito,
   * porque a alternativa era adivinhar — e adivinhar dava oito milhões de euros.
   *
   * O que não pode acontecer é ficar calado. Sem isto, um valor que ela escreveu
   * a contar que contasse é indistinguível de um «a definir» deliberado: os dois
   * imprimem «—» na coluna do dinheiro e nenhum aparece em lado nenhum. Com
   * isto, o rótulo da linha vai no aviso e ela sabe qual é que tem de reescrever.
   */
  const ilegiveis = (doc.budgetExtras ?? [])
    .filter((e) => textoTemNumeroQueNaoSeLe(e.valueText))
    .map((e) => e.label?.trim() || "(sem nome)");
  if (ilegiveis.length > 0) {
    porQueNaoFecha.push(
      ilegiveis.length === 1
        ? `o valor adicional «${ilegiveis[0]}» tem um número escrito que não se consegue somar — escreve um valor só (por exemplo «800,00 €») e põe o resto ao lado do nome`
        : `${ilegiveis.length} valores adicionais têm números que não se conseguem somar (${ilegiveis.map((n) => `«${n}»`).join(", ")}) — cada um precisa de um valor só`,
    );
  }
  /**
   * ── E A COLUNA DE PREÇOS DO MODELO ORGANIZAÇÃO ──────────────────────────
   *
   * As três verificações de cima são sobre contas NOSSAS, e fecham por
   * construção. Esta é sobre números escritos à MÃO — a única coluna do
   * documento em que um valor dela é impresso linha a linha — e pode não
   * fechar por dados, não por código. Ver {@link somaDasLinhasEstimadas}: o
   * caso medido são 6.500 + 1.850 impressos por baixo de um TOTAL de 12.500.
   *
   * `money.base > 0`: sem total escrito não há total impresso, e portanto não
   * há contradição nenhuma a apontar — uma proposta a meio de ser escrita não
   * pode acender avisos.
   */
  const estimadas = somaDasLinhasEstimadas(doc, { mode: money.mode, vatRate: money.vatRate });
  if (estimadas && money.base > 0) {
    const diferenca = round2(servicos - estimadas.soma);
    // A mesma tolerância de um cêntimo do {@link desalinhamento}, e pela mesma
    // razão: a soma é feita em vírgula flutuante e os dois lados foram
    // escritos por uma pessoa.
    if (Math.abs(diferenca) > 0.01) {
      const semPreco =
        estimadas.semPreco === 1
          ? "1 rubrica sem preço"
          : `${estimadas.semPreco} rubricas sem preço`;
      porQueNaoFecha.push(
        estimadas.semPreco > 0
          ? // A frase diz as três coisas que o casal vê e não consegue ligar: o
            // que a coluna soma, o que o quadro fecha, e quantas rubricas estão
            // a esconder a diferença.
            `as linhas do orçamento com preço somam ${estimadas.soma} e o quadro fecha em ${servicos} — ${semPreco}, e a diferença de ${Math.abs(diferenca)} não está escrita em lado nenhum`
          : `as linhas do orçamento somam ${estimadas.soma} e o quadro fecha em ${servicos} (${Math.abs(diferenca)} de diferença)`,
      );
    }
  }

  return {
    servicos,
    adicionais,
    total: money.base,
    iva: money.vat,
    aPagar: money.gross,
    sinal,
    saldo,
    percentagemSinal,
    taxa: money.vatRate,
    modo: money.mode,
    fecha: porQueNaoFecha.length === 0,
    porQueNaoFecha,
  };
}

// ── Alterações às linhas ──────────────────────────────────────────────────
// Todas passam por aqui, e todas mexem nos DOIS arrays. É esta a única defesa
// contra o desalinhamento dos índices.

type ComOrcamento = Pick<
  ProposalDoc,
  | "budgetItems"
  | "budgetAmounts"
  | "budgetCosts"
  | "budgetScales"
  | "budgetOpcional"
  | "budgetItemsEn"
  | "budgetArtigos"
  | "budgetSubpontos"
>;

/**
 * Os arrays paralelos que NÃO são os preços: custo, escala e marca de extra.
 *
 * Estão aqui porque acompanham a linha e têm de acompanhar também o que lhe
 * acontece. Enquanto só o preço era tratado, apagar a linha 2 de cinco deixava
 * os custos, as escalas e as marcas todas uma posição à frente — o custo da
 * iluminação passava a ser o do ramo da noiva, e a margem dessa linha saía de
 * outra linha qualquer. Não dava erro nenhum: dava números errados com bom
 * aspecto, que é a pior maneira de um orçamento correr mal.
 *
 * Cada um traz o valor com que uma linha nova nasce.
 */
const PARALELOS = [
  { campo: "budgetCosts", nascePor: null },
  { campo: "budgetScales", nascePor: null },
  { campo: "budgetOpcional", nascePor: false },
  // A rubrica escrita em inglês, quando a proposta é bilingue. Entra aqui e não
  // num tratamento à parte pela razão que este bloco todo conta: uma segunda
  // lista dos arrays paralelos é uma lista que se esquece do array seguinte. Um
  // deslize de uma posição aqui não dá erro nenhum — dá a rubrica errada
  // traduzida no PDF de um cliente que não lê a versão portuguesa.
  //
  // Nasce `null` («ainda não foi traduzida»), que é diferente de `""` («foi
  // decidido que fica igual»). Ver `ProposalDoc.budgetItemsEn`.
  { campo: "budgetItemsEn", nascePor: null },
  // O artigo do Moloni de cada linha (5/11): viaja com a linha, como o preço.
  { campo: "budgetArtigos", nascePor: null },
  // Os subpontos internos de cada linha (6/11): viajam com a linha.
  { campo: "budgetSubpontos", nascePor: null },
] as const;

/** Corta ou estica um array paralelo até ao tamanho das linhas. */
function alinhado(doc: ComOrcamento, campo: (typeof PARALELOS)[number]["campo"], omissao: unknown) {
  const n = doc.budgetItems?.length ?? 0;
  const guardado = (doc[campo] as unknown[] | undefined) ?? [];
  return Array.from({ length: n }, (_, i) => (i < guardado.length ? guardado[i] : omissao));
}

/** Aplica a mesma transformação a todos os arrays paralelos de uma vez. */
function comParalelos<T extends ComOrcamento>(
  doc: T,
  transformar: (valores: unknown[], nascePor: unknown) => unknown[],
): Partial<Record<(typeof PARALELOS)[number]["campo"], unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const { campo, nascePor } of PARALELOS) {
    // Só se escreve o que JÁ existia: um documento que nunca teve custos não
    // ganha um array de nulls por ter perdido uma linha, e continua a
    // serializar exactamente como serializava.
    if (doc[campo] === undefined) continue;
    out[campo] = transformar(alinhado(doc, campo, nascePor), nascePor);
  }
  return out;
}

export function adicionarLinha<T extends ComOrcamento>(doc: T, item = ""): T {
  return {
    ...doc,
    budgetItems: [...(doc.budgetItems ?? []), item],
    budgetAmounts: [...precosDe(doc), null],
    ...comParalelos(doc, (v, nascePor) => [...v, nascePor]),
  };
}

export function removerLinha<T extends ComOrcamento>(doc: T, i: number): T {
  return {
    ...doc,
    budgetItems: (doc.budgetItems ?? []).filter((_, j) => j !== i),
    budgetAmounts: precosDe(doc).filter((_, j) => j !== i),
    ...comParalelos(doc, (v) => v.filter((_, j) => j !== i)),
  };
}

export function definirItem<T extends ComOrcamento>(doc: T, i: number, item: string): T {
  return {
    ...doc,
    budgetItems: (doc.budgetItems ?? []).map((v, j) => (j === i ? item : v)),
    // Os preços ficam onde estão, mas NORMALIZADOS: um documento antigo sem
    // `budgetAmounts` ganha aqui o array do tamanho certo, em vez de o ganhar
    // pela primeira vez a meio de uma remoção.
    budgetAmounts: precosDe(doc),
  };
}

export function definirPreco<T extends ComOrcamento>(doc: T, i: number, preco: number | null): T {
  return {
    ...doc,
    budgetItems: [...(doc.budgetItems ?? [])],
    budgetAmounts: precosDe(doc).map((v, j) => (j === i ? preco : v)),
  };
}
