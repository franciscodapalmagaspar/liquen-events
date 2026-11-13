import { POR_DEFINIR_PT, type ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "./types";
import { foraDoPadrao, padraoPara, paxDaProposta } from "./padrao-de-preco";
import { camposComVersaoInglesa, camposPorTraduzir, lerEn } from "@/lib/proposal-doc-bilingue";
import { oQueFaltaParaEnviar } from "@/lib/proposal-progress";
import { IDIOMA_POR_OMISSAO, type IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import { listasQueNaoSaem } from "@/lib/pdf-editorial/plano";
import { camposDeEscolhaPorTraduzir } from "@/lib/proposta-escolhas";
import { choquesDeData } from "./choque-de-datas";
import { isoDaDataPorExtenso } from "@/lib/proposal-doc-textos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CONFERÊNCIA ANTES DE ENVIAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Um erro no nome numa proposta de casamento custa credibilidade, e custa-a
 * inteira: quem recebe uma proposta com o nome mal escrito conclui, e conclui
 * bem, que aquilo foi feito à pressa. O envio é irreversível — o email sai uma
 * vez — por isso a última coisa antes do botão é uma passagem de olhos feita
 * pelo programa sobre o que ele consegue mesmo verificar.
 *
 * ── O QUE ISTO É E O QUE NÃO É ─────────────────────────────────────────────
 * Não é um corretor ortográfico nem um juiz de preços. É uma comparação entre
 * a PROPOSTA e o PEDIDO que lhe deu origem — dois documentos que deviam dizer
 * o mesmo e que se escrevem em momentos diferentes, que é exactamente quando
 * as coisas divergem.
 *
 * ── NADA AQUI TRAVA O ENVIO ────────────────────────────────────────────────
 * O que trava está em `proposal-progress.ts` e continua lá. Isto é a passagem
 * de olhos: mostra-se, lê-se, e decide-se. Uma data diferente da do pedido
 * pode ser a data certa — o casal mudou de ideias e disse-o ao telefone.
 */

export type Severidade = "erro" | "aviso" | "ok";

export interface Verificacao {
  id: string;
  titulo: string;
  severidade: Severidade;
  /** O que dizer quando não está bem. Vazio quando está. */
  detalhe: string;
  /** A secção do estúdio onde isto se resolve, para o link lá saltar. */
  seccao?: string;
  /** O `data-campo` do controlo, quando ele existe — o salto ao campo certo. */
  campo?: string;
  /**
   * Isto TRAVA o envio?
   *
   * A regra continua a ser uma só, e continua em `proposal-progress.ts`: esta
   * marca é copiada de lá, nunca decidida aqui. O que mudou é que a lista deixou
   * de ser duas — ver o cabeçalho de {@link conferir}.
   */
  trava?: boolean;
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const semAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Compara nomes ignorando acentos, maiúsculas e espaços a mais. */
function mesmoNome(a: string, b: string): boolean {
  const n = (s: string) => semAcentos(s).replace(/\s+/g, " ").trim();
  return n(a) === n(b);
}

/** Os meses como aparecem escritos numa proposta, já sem acentos. */
const MESES = [
  "janeiro",
  "fevereiro",
  "marco",
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

/**
 * Os meses (1–12) escritos por extenso num texto livre de data.
 *
 * Devolve uma LISTA porque a data de um evento de vários dias pode nomear dois
 * ("de 30 de Setembro a 2 de Outubro"), e vazio quando não há mês legível — que
 * é o caso de "18.09.2027", de "Set." e de tudo o que ela escreva à maneira
 * dela. Vazio quer dizer "não sei", nunca "está errado".
 */
function mesesEscritos(texto: string): number[] {
  const t = semAcentos(texto);
  return MESES.map((m, i) => (t.includes(m) ? i + 1 : 0)).filter((m) => m > 0);
}

/**
 * Os números de pessoas escritos num texto livre de convidados.
 *
 * Devolve uma LISTA pela mesma razão que {@link mesesEscritos}: o campo é
 * texto livre e ela escreve-o à maneira dela — "120 pax", "100 a 150 pessoas",
 * "±120". Vazio ("cerca de uma centena") quer dizer "não sei", nunca "está
 * errado".
 */
function paxEscritos(texto: string): number[] {
  return [...texto.matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => n > 0);
}

/**
 * Marcadores de MODELO — os que nunca são texto verdadeiro, escrevam-se onde
 * se escreverem. Um "[Valor Total]" que chega ao cliente diz-lhe, com todas as
 * letras, que recebeu um modelo por preencher.
 */
const MARCADORES_DE_MODELO = [
  /\[[^\]]+\]/, // [Valor Total], [Nome], [Data]
  /\bxxx+\b/i,
  /\blorem ipsum\b/i,
];

/**
 * E as frases de «ainda não sei» — que num campo normal são um esquecimento.
 *
 * Um cabeçalho, um local ou um nome de serviço a dizer "a definir" é trabalho
 * por acabar a caminho do cliente. Ver a excepção logo a seguir.
 */
const POR_SABER = [/\bpor preencher\b/i, /\ba definir\b/i];

/**
 * ── A EXCEPÇÃO DOS VALORES ADICIONAIS ─────────────────────────────────────
 * O `valueText` de um `BudgetExtra` é TEXTO LIVRE — está dito com todas as
 * letras em `proposal-budget.ts`, e é assim que aparece nas propostas
 * verdadeiras da Líquen: "896,00 €", "895,00 € + IVA", "a definir", "sob
 * consulta". Escrever «Deslocação da equipa Líquen — a definir» porque ainda
 * não se sabe onde é o evento é o comportamento certo, e a conferência
 * acendia-o a vermelho como «Ficou por substituir».
 *
 * O estrago não era o vermelho a mais: ou ela apagava um valor legítimo, ou
 * aprendia a ignorar o único aviso que existe para apanhar um "[Valor Total]"
 * a caminho do cliente. Por isso este campo — e só este — é conferido apenas
 * contra os marcadores de modelo. O RÓTULO do adicional não: o valor é que
 * fica por saber, o nome do que se cobra não.
 */
function encontrarPlaceholders(doc: ProposalDoc): string[] {
  /**
   * ── E AS CAIXAS INGLESAS ──────────────────────────────────────────────────
   * Um «[TBD]» escrito na caixa inglesa chega ao cliente exactamente da mesma
   * maneira que um «[Valor Total]» na portuguesa.
   *
   * Varridas SÓ com os marcadores de modelo, nunca com o `POR_SABER`: «a
   * definir» e «por preencher» são frases portuguesas, e o equivalente inglês
   * («TBD», «to be defined») é legítimo numa proposta inglesa — a mesma
   * excepção, e o mesmo argumento, do `valueText` dos valores adicionais.
   */
  const ingleses = camposComVersaoInglesa(doc)
    .map((c) => lerEn(doc, c.campo))
    .filter((t): t is string => typeof t === "string");
  const campos: (string | undefined)[] = [
    doc.headerTitle,
    doc.clientNames,
    doc.eventDate,
    doc.location,
    doc.totalText,
    doc.totalEstimatedText,
    doc.budgetNote,
    ...(doc.observacoesGerais ?? []),
    ...(doc.budgetItems ?? []),
    ...(doc.serviceGroups ?? []).flatMap((g) => [
      g.title,
      ...(g.items ?? []).map((i) => i.label),
      ...(g.items ?? []).map((i) => i.desc),
    ]),
    ...(doc.budgetExtras ?? []).map((e) => e.label),
  ];
  const achados: string[] = [];
  const junta = (t: string, regras: RegExp[]) => {
    if (t && regras.some((re) => re.test(t))) achados.push(t.slice(0, 60));
  };
  for (const c of campos) junta(texto(c), [...MARCADORES_DE_MODELO, ...POR_SABER]);
  for (const e of doc.budgetExtras ?? []) junta(texto(e.valueText), MARCADORES_DE_MODELO);
  for (const t of ingleses) junta(texto(t), MARCADORES_DE_MODELO);
  return [...new Set(achados)];
}

/** O idioma que o cliente usou, deduzido do que ele escreveu no pedido. */
function idiomaDoCliente(quote: Quote): "pt" | "en" | null {
  const l = (quote as { locale?: string }).locale;
  if (typeof l === "string" && l) return l.startsWith("en") ? "en" : "pt";
  return null;
}

export interface Contexto {
  doc: ProposalDoc;
  quote: Quote;
  /** Todos os pedidos, para o padrão de preço. */
  historico: Quote[];
  /** O total bruto da proposta, como ela o vê no estúdio. */
  totalBruto: number;
  /**
   * A língua em que o PDF vai sair — o `idiomaDoPdf` escolhido no estúdio.
   *
   * Opcional, e ausente vale português: é a mesma regra do resto da casa (ver
   * `proposta-idioma.ts`), e é o que faz esta lista continuar a ser a de sempre
   * para quem nunca escolheu inglês.
   */
  idioma?: IdiomaDaProposta;
  /**
   * Por onde segue, e o email do pedido — o que o `oQueFaltaParaEnviar` precisa
   * para saber se a falta do email trava. Ausentes, o email não se verifica:
   * ver `ContextoDoEnvio.canal`.
   */
  canal?: "email" | "whatsapp" | "ambos";
  emailDoCliente?: string;
  /** O dia de hoje (yyyy-mm-dd), para a validade. Injetável para testes. */
  hoje?: string;
  /**
   * O PDF final desta versão já foi visto e confirmado? Passa tal e qual ao
   * `oQueFaltaParaEnviar` (`ContextoDoEnvio.pdfVisto`). Sem ele, a pastilha do
   * envio dizia «Faltam 4» e esta lista «3 coisas impedem o envio»: a quarta
   * era o «Ver o PDF», que só uma das duas contava. Ausente, não se verifica.
   */
  pdfVisto?: boolean;
}

/**
 * A lista de conferência. Devolve TODAS as verificações, incluindo as que
 * passaram — ver uma lista só com problemas não diz se as outras foram
 * sequer feitas, e é essa dúvida que faz voltar a conferir à mão.
 */
/**
 * Onde é que cada assunto desta lista se resolve, no estúdio.
 *
 * `seccao` é o alvo de recurso (o cartão da secção); `campo` é o `data-campo`
 * do controlo, que é o que põe o cursor dentro da caixa certa. Sem controlo
 * próprio — o texto de exemplo pode estar em qualquer campo — fica de fora e a
 * linha não é um link, que é honesto: um link que salta para o sítio errado é
 * pior do que nenhum.
 */
const ONDE_SE_RESOLVE: Readonly<Record<string, { seccao: string; campo?: string }>> = {
  nome: { seccao: "evento", campo: "clientNames" },
  data: { seccao: "evento", campo: "eventDate" },
  local: { seccao: "evento", campo: "location" },
  convidados: { seccao: "evento", campo: "guests" },
  valor: { seccao: "total", campo: "totalAmount" },
  idioma: { seccao: "evento" },
};

export function conferir({
  doc,
  quote,
  historico,
  totalBruto,
  idioma = IDIOMA_POR_OMISSAO,
  canal,
  emailDoCliente,
  hoje,
  pdfVisto,
}: Contexto): Verificacao[] {
  const v: Verificacao[] = [];

  // ── O nome ──────────────────────────────────────────────────────────────
  const naProposta = texto(doc.clientNames);
  const noPedido = texto(quote.name);
  if (!naProposta) {
    v.push({
      id: "nome",
      titulo: "Nome dos clientes",
      severidade: "erro",
      detalhe: "Está vazio na proposta.",
    });
  } else if (noPedido && !mesmoNome(naProposta, noPedido)) {
    // Não é necessariamente um erro: o pedido pode ter sido feito pela mãe da
    // noiva, e a proposta dirige-se ao casal. Mas é sempre para olhar.
    v.push({
      id: "nome",
      titulo: "Nome dos clientes",
      severidade: "aviso",
      detalhe: `A proposta diz "${naProposta}" e o pedido veio em nome de "${noPedido}".`,
    });
  } else {
    v.push({ id: "nome", titulo: "Nome dos clientes", severidade: "ok", detalhe: "" });
  }

  // ── A data ──────────────────────────────────────────────────────────────
  const dataProposta = texto(doc.eventDate);
  const dataPedido = texto(quote.date);
  if (!dataProposta) {
    v.push({
      id: "data",
      titulo: "Data do evento",
      severidade: "aviso",
      detalhe: "A proposta não tem data.",
    });
  } else if (dataPedido && /^\d{4}-\d{2}-\d{2}$/.test(dataPedido)) {
    // A data da proposta escreve-se por extenso ("12 de Setembro de 2027"), por
    // isso compara-se pelos números que lá estão: o ano e o dia.
    //
    // ── E PELO MÊS, QUE É O QUE SE TROCA ────────────────────────────────────
    // O mês é a única parte da data que se escreve por palavras, e por isso é a
    // que se troca — um pedido para 18 de Setembro com a proposta a dizer 18 de
    // Outubro batia no ano, batia no dia, e levava um visto verde a caminho do
    // cliente. Um visto verde numa data errada é pior do que não conferir nada:
    // quem lê o visto deixa de conferir.
    //
    // Só desmente quando o mês está mesmo lá escrito. O campo é texto livre e
    // ela escreve-o à maneira dela ("18.09.2027", "Set."); sem mês legível não
    // há nada a contradizer, e o dia e o ano continuam a mandar como sempre.
    const ano = dataPedido.slice(0, 4);
    const dia = String(Number(dataPedido.slice(8, 10)));
    const mes = Number(dataPedido.slice(5, 7));
    const mesesDaProposta = mesesEscritos(dataProposta);
    const bate =
      dataProposta.includes(ano) &&
      new RegExp(`\\b${dia}\\b`).test(dataProposta) &&
      (mesesDaProposta.length === 0 || mesesDaProposta.includes(mes));
    v.push({
      id: "data",
      titulo: "Data do evento",
      severidade: bate ? "ok" : "aviso",
      detalhe: bate ? "" : `A proposta diz "${dataProposta}" e o pedido pedia ${dataPedido}.`,
    });
  } else {
    v.push({ id: "data", titulo: "Data do evento", severidade: "ok", detalhe: "" });
  }

  // ── O local ─────────────────────────────────────────────────────────────
  const localProposta = texto(doc.location);
  const localPedido = texto(quote.location);
  if (!localProposta) {
    v.push({
      id: "local",
      titulo: "Local",
      severidade: "aviso",
      detalhe: "A proposta não diz onde é.",
    });
  } else if (localPedido && !mesmoNome(localProposta, localPedido)) {
    v.push({
      id: "local",
      titulo: "Local",
      severidade: "aviso",
      detalhe: `A proposta diz "${localProposta}" e o pedido dizia "${localPedido}".`,
    });
  } else {
    v.push({ id: "local", titulo: "Local", severidade: "ok", detalhe: "" });
  }

  // ── Os convidados ───────────────────────────────────────────────────────
  //
  // ── E NÃO SÓ SE O CAMPO ESTÁ PREENCHIDO ─────────────────────────────────
  // Isto perguntava apenas se havia lá alguma coisa escrita: uma proposta a
  // dizer "80 pax" para um pedido de 120 levava um visto verde, e com ele a
  // frase "Está tudo de acordo com o pedido original". É o número que manda no
  // catering e no preço por pessoa, e o aviso do valor não o apanha — o
  // intervalo habitual é construído com os 120 pax DO PEDIDO, portanto uma
  // proposta de 80 pax cobrada a 120 fica bem dentro do costume.
  //
  // Como no mês da data: só se desmente quando o número está mesmo lá escrito.
  // Um intervalo que contenha o número do pedido ("100 a 150" para 120) é uma
  // maneira legítima de o dizer e não se contraria.
  const paxProposta = texto(doc.guests);
  const paxPedido = typeof quote.guests === "number" && quote.guests > 0 ? quote.guests : null;
  const paxBate = (pax: number): boolean => {
    const numeros = paxEscritos(paxProposta);
    if (numeros.length === 0) return true;
    if (numeros.includes(pax)) return true;
    return numeros.length > 1 && pax >= Math.min(...numeros) && pax <= Math.max(...numeros);
  };
  if (!paxProposta) {
    v.push({
      id: "convidados",
      titulo: "Número de convidados",
      severidade: "aviso",
      detalhe: "A proposta não diz para quantas pessoas é.",
    });
  } else if (paxPedido !== null && !paxBate(paxPedido)) {
    v.push({
      id: "convidados",
      titulo: "Número de convidados",
      severidade: "aviso",
      detalhe: `A proposta é para "${paxProposta}" e o pedido pedia ${paxPedido}.`,
    });
  } else {
    v.push({ id: "convidados", titulo: "Número de convidados", severidade: "ok", detalhe: "" });
  }

  // ── O valor ─────────────────────────────────────────────────────────────
  if (totalBruto <= 0) {
    v.push({
      id: "valor",
      titulo: "Valor",
      severidade: "erro",
      detalhe: "A proposta não tem valor.",
    });
  } else {
    // ── O NÚMERO DE CONVIDADOS VEM DA PROPOSTA, NÃO DO PEDIDO ────────────
    // Ver `paxDaProposta`: se ela corrigiu os convidados aqui, é com esses que
    // o preço se compara. A lista dizia, três linhas acima, que os dois
    // divergem — e comparava o preço com o número velho na mesma.
    const pax = paxDaProposta(doc, quote);
    const fora = foraDoPadrao(
      totalBruto,
      padraoPara({ guests: pax, location: quote.location }, historico),
    );
    v.push({
      id: "valor",
      titulo: "Valor",
      severidade: fora ? "aviso" : "ok",
      // ── E DIZ EM QUANTOS CASOS ASSENTA ─────────────────────────────────
      // O Painel Interno já o dizia e esta lista não. Um intervalo sem o número
      // de casos por trás não se sabe se é um padrão ou uma coincidência — e a
      // decisão de acreditar nele é dela, não do programa.
      detalhe: fora
        ? `${pax} pax costuma ficar entre ${Math.round(fora.padrao.min)} € e ${Math.round(
            fora.padrao.max,
          )} €${fora.padrao.regiao ? ` (${fora.padrao.regiao})` : ""}, em ${fora.padrao.casos} propostas; esta está ${
            fora.lado === "abaixo" ? "abaixo" : "acima"
          }.`
        : "",
    });
  }

  // ── Texto de exemplo esquecido ──────────────────────────────────────────
  const restos = encontrarPlaceholders(doc);
  v.push({
    id: "placeholders",
    titulo: "Texto de exemplo",
    severidade: restos.length > 0 ? "erro" : "ok",
    detalhe:
      restos.length > 0
        ? `Ficou por substituir: ${restos.slice(0, 3).join(" · ")}${restos.length > 3 ? "…" : ""}`
        : "",
  });

  // ── Uma condição que ficou com «a definir» no meio (A4-009) ─────────────
  //
  // As cláusulas da CASA sabem dizer-se sem a data e sem o número («válida para
  // a data que vier a ser confirmada»). Uma que ela escreveu à mão com
  // `{CONVIDADOS}` não sabe, e o preenchimento põe lá «a definir»: o casal lia
  // «O orçamento cobre a definir convidados.» numa cláusula contratual. Não se
  // adivinha a redacção dela — avisa-se, e ela decide (pôr o dado, ou
  // reescrever a frase).
  const porDefinir = (doc.condicoesGerais ?? []).filter((l) => l.includes(POR_DEFINIR_PT));
  v.push({
    id: "condicoes-por-definir",
    titulo: "Condições Gerais",
    severidade: porDefinir.length > 0 ? "aviso" : "ok",
    detalhe:
      porDefinir.length > 0
        ? `${porDefinir.length === 1 ? "Uma condição diz" : `${porDefinir.length} condições dizem`} «a definir» porque falta a data ou o número de convidados: «${porDefinir[0].slice(0, 90)}${porDefinir[0].length > 90 ? "…" : ""}»`
        : "",
  });

  // ── Duas secções seguidas com o mesmo título ────────────────────────────
  //
  // Numa proposta que já seguiu, «Complementos dos Noivos» era o título de
  // DUAS secções consecutivas: uma para o ramo da noiva, outra para as
  // lapelas. Os subtítulos diziam qual era qual, mas quem lê de cima para
  // baixo vê o mesmo título duas vezes e conclui, antes de chegar ao
  // subtítulo, que ficou ali um duplicado por engano.
  //
  // ── PORQUE É QUE COMPARA NA LÍNGUA QUE VAI SAIR ────────────────────────
  // Porque é essa que o casal lê. Dois títulos diferentes em português podem
  // ter sido traduzidos para o mesmo inglês — e nesse caso a repetição existe
  // só na proposta inglesa, que é precisamente a que ela não relê.
  //
  // ── PORQUE É QUE SÓ OLHA PARA AS SEGUIDAS ──────────────────────────────
  // Porque duas secções com o mesmo título separadas por outras leem-se como
  // dois capítulos do mesmo assunto, e isso é uma escolha legítima. Encostadas
  // uma à outra é que parecem o mesmo bloco colado duas vezes.
  //
  // ── E PORQUE É QUE AVISA EM VEZ DE CORRIGIR ────────────────────────────
  // Porque as saídas boas são decisões dela e não se adivinham: juntar as
  // fotografias numa secção só, ou dar a cada uma o seu título. Repetir de
  // propósito também é uma resposta.
  const boards = doc.moodBoards ?? [];
  const tituloDaSeccao = (b: { title?: string; titleEn?: string }) =>
    idioma === "en" ? texto(b.titleEn) || texto(b.title) : texto(b.title);

  if (boards.length > 1) {
    /** O índice do SEGUNDO de cada par repetido: é esse que se vai corrigir. */
    const repetidos: number[] = [];
    for (let i = 1; i < boards.length; i += 1) {
      const este = tituloDaSeccao(boards[i]);
      // Um título vazio repetido não é este defeito: é «falta o título», e
      // quem o diz é `oQueFaltaParaEnviar`. Acusá-lo aqui seria a mesma falta
      // contada duas vezes com dois nomes.
      if (este && mesmoNome(este, tituloDaSeccao(boards[i - 1]))) repetidos.push(i);
    }

    const primeiro = repetidos[0];
    const maisCasos = repetidos.length - 1;
    v.push({
      id: "titulos-seguidos",
      titulo: "Títulos das secções",
      severidade: repetidos.length > 0 ? "aviso" : "ok",
      detalhe:
        repetidos.length > 0
          ? [
              `«${tituloDaSeccao(boards[primeiro])}» é o título das secções ${primeiro} e ${
                primeiro + 1
              }, uma a seguir à outra.`,
              texto(boards[primeiro].subtitulo) || texto(boards[primeiro - 1].subtitulo)
                ? "Os subtítulos distinguem-nas, mas o título repetido lê-se como um engano: ou se juntam numa secção só, ou o subtítulo sobe para o título."
                : "Ou se juntam numa secção só, ou cada uma leva o seu título.",
              maisCasos > 0
                ? maisCasos === 1
                  ? "Há mais um caso destes."
                  : `Há mais ${maisCasos} casos destes.`
                : "",
            ]
              .filter(Boolean)
              .join(" ")
          : "",
      ...(repetidos.length > 0 ? { seccao: "moodboards", campo: `boardTitulo:${primeiro}` } : {}),
    });
  }

  // ── O idioma ────────────────────────────────────────────────────────────
  //
  // ════════════════════════════════════════════════════════════════════════
  // ESTA VERIFICAÇÃO FOI REESCRITA, E O QUE ELA DIZIA DEIXOU DE SER VERDADE
  // ════════════════════════════════════════════════════════════════════════
  //
  // Dizia «O pedido veio em inglês e a proposta é escrita em português», com um
  // comentário por cima a explicar que não havia um interruptor de idioma no
  // PDF e que inventar aqui um seria descrever uma função que não existe.
  //
  // Há. Há o selector do passo «Pré-visualizar», há a língua gravada com a
  // proposta, e há agora a prosa dela escrita nas duas línguas. A verificação
  // foi REESCRITA e não acrescentada ao lado: duas linhas sobre idioma na mesma
  // lista, uma delas falsa, ensinam a ignorar as duas.
  //
  // ── EM INGLÊS, O QUE INTERESSA É O QUE VAI SAIR EM PORTUGUÊS ────────────
  // A caixa inglesa vazia cai para o português, sem marca nenhuma no papel — é
  // a única regra que nunca produz um buraco. A defesa é dizê-lo ANTES, e este
  // é o último sítio onde se diz.
  //
  // ── EM PORTUGUÊS, O QUE INTERESSA É O PEDIDO ───────────────────────────
  // Quem escreveu em inglês vai receber uma proposta que não lê. Os pedidos
  // anteriores ao campo `locale` não têm idioma guardado, e nesse caso não se
  // diz nada — que é diferente de dizer que está tudo bem. E é também o que faz
  // o estúdio de quem nunca faz propostas inglesas não ganhar uma linha.
  //
  // NUNCA `erro`: a Conferência não trava nada, por princípio (ver o cabeçalho
  // deste ficheiro), e não é aqui que essa regra se rompe. Uma proposta com
  // metade da prosa por traduzir tem de poder seguir — ela pode ter decidido
  // que aquelas oito rubricas são nomes próprios.
  const doCliente = idiomaDoCliente(quote);
  if (idioma === "en") {
    // As ALTERNATIVAS também (A6-010): não entravam em contagem nenhuma, e a
    // Conferência dava «Idioma: ok» a uma proposta inglesa com as escolhas do
    // casal em português.
    const faltam = [
      ...camposPorTraduzir(doc),
      ...camposDeEscolhaPorTraduzir(doc.escolhas).map((c) => ({ rotulo: c.rotulo })),
    ];
    const primeiros = faltam.slice(0, 3).map((c) => c.rotulo);
    v.push({
      id: "idioma",
      titulo: "Idioma",
      severidade: faltam.length > 0 ? "aviso" : "ok",
      detalhe:
        faltam.length > 0
          ? `${
              faltam.length === 1
                ? "1 campo não tem versão inglesa e vai sair em português"
                : `${faltam.length} campos não têm versão inglesa e vão sair em português`
            }: ${primeiros.join(" · ")}${faltam.length > 3 ? "…" : ""}`
          : "",
    });
  } else if (doCliente) {
    v.push({
      id: "idioma",
      titulo: "Idioma",
      severidade: doCliente === "en" ? "aviso" : "ok",
      detalhe:
        doCliente === "en"
          ? "O pedido veio em inglês e vais gerar em português. O selector do idioma está no passo anterior."
          : "",
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // E O QUE FALTA PARA PODER ENVIAR — NA MESMA LISTA, NÃO NUMA SEGUNDA
  // ════════════════════════════════════════════════════════════════════════
  //
  // Havia duas listas a dizer coisas parecidas com dois vocabulários: esta
  // (erro / aviso / conferido) e a de `proposal-progress` (trava / conselho),
  // esta no passo de envio e aquela numa coluna que só existe acima de 1280 px.
  // Mais uma frase estática por baixo do botão, sem links, a repetir a terceira
  // versão do mesmo. Três sítios a dizer o mesmo é como se ensina alguém a não
  // ler nenhum.
  //
  // Passa a haver UMA lista, e as regras continuam a nascer onde nasciam: quem
  // decide o que trava é `oQueFaltaParaEnviar`, e o que se copia de lá é a
  // MARCA (`trava`), nunca a decisão.
  //
  // ── PORQUE É QUE ISTO NÃO ACRESCENTA TUDO ────────────────────────────────
  // Metade dos impedimentos são assuntos que esta lista já cobre, e cobre-os
  // melhor: sabe comparar com o pedido. Para esses — o mesmo `id` — o que entra
  // é só a marca de trava; a frase é a que já cá estava. Os outros (o título
  // interno, os grupos, as capas, os boards, a soma) não tinham voz nenhuma
  // aqui e entram tal como estão escritos.
  // ── As listas que não saem ────────────────────────────────────────────
  //
  // Achado F-13 de uma auditoria em produção: na proposta da Maria João, a
  // vista de conjunto anunciava as páginas 4 e 5 com «Esta folha sai em
  // branco» — e o documento seguiu para o cliente com duas folhas vazias no
  // meio. «A aplicação sabe e avisa — mas deixa enviar.»
  //
  // O desenho novo do PDF já não imprime uma secção sem conteúdo: a folha
  // vazia deixou de existir. O que continua a poder faltar é o TEXTO — umas
  // condições gerais apagadas por engano saem como «não há condições», e isso
  // é tão grave como a folha em branco era. O `id` fica o mesmo, porque a
  // pergunta é a mesma: o documento vai sair com um buraco?
  //
  // ── PORQUE É QUE ISTO NÃO TRAVA ─────────────────────────────────────────
  //
  // Pela regra desta casa, escrita no cabeçalho: o que trava nasce em
  // `proposal-progress.ts` e é copiado, nunca decidido aqui. É dela a decisão
  // de a mandar na mesma (pode estar a enviar uma versão para ela própria
  // ver); o que não pode é ir sem ela ter tido a hipótese de reparar.
  //
  // `aviso` e não `erro` pela mesma razão que a data diferente da do pedido é
  // `aviso`: é sempre para olhar, e nem sempre é um defeito.
  // As CONDIÇÕES saíram daqui: passaram a travar (B1 do documento dela) e têm
  // linha própria, vinda de `oQueFaltaParaEnviar`. Ficam as Observações, que
  // continuam a ser só para olhar.
  const faltam = listasQueNaoSaem(doc).filter((p) => p.id !== "condicoes");
  v.push(
    faltam.length === 0
      ? { id: "folhas-em-branco", titulo: "Secções do documento", severidade: "ok", detalhe: "" }
      : {
          id: "folhas-em-branco",
          titulo: faltam.length === 1 ? "Uma secção não sai no PDF" : "Secções que não saem no PDF",
          severidade: "aviso",
          detalhe: `${faltam.map((p) => `«${p.nome}»`).join(" e ")} ${
            faltam.length === 1 ? "está vazia e não sai" : "estão vazias e não saem"
          } no PDF.`,
          seccao: faltam[0].seccao,
        },
  );

  // ── A data ocupada ────────────────────────────────────────────────────
  //
  // O cartão «Data ocupada» já existia no Evento; faltava na lista do envio,
  // que é a última coisa que ela lê antes do botão. A data é a que está
  // ESCRITA na proposta quando se consegue ler, e a do pedido quando não —
  // a mesma regra do cartão (`pedidoComADataDoDoc` no estúdio).
  const dataLida = isoDaDataPorExtenso(texto(doc.eventDate)) ?? texto(quote.date);
  const choques = dataLida
    ? choquesDeData(
        {
          ...quote,
          date: dataLida,
          endDate: dataLida === quote.date ? quote.endDate : "",
          location: texto(doc.location) || quote.location,
        },
        historico,
      )
    : [];
  if (choques.length > 0) {
    const mesmoDia = choques.filter((c) => c.proximidade === "mesmo-dia").length;
    v.push({
      id: "data-ocupada",
      titulo: "Data ocupada",
      severidade: "aviso",
      detalhe:
        mesmoDia > 0
          ? mesmoDia === 1
            ? "Há outro evento marcado no mesmo dia."
            : `Há ${mesmoDia} eventos marcados no mesmo dia.`
          : choques.length === 1
            ? "Há um evento marcado na véspera ou no dia seguinte."
            : `Há ${choques.length} eventos marcados na véspera ou no dia seguinte.`,
      seccao: "evento",
      campo: "eventDate",
    });
  }

  const porId = new Map(v.map((x) => [x.id, x]));
  for (const falta of oQueFaltaParaEnviar(doc, totalBruto, {
    idioma,
    canal,
    emailDoCliente,
    hoje,
    pdfVisto,
  })) {
    // «Por traduzir» é o assunto que esta lista chama «Idioma» — a mesma
    // pergunta com outro nome, e duas linhas sobre ela era uma a mais.
    const jaDito = porId.get(falta.id === "ingles" ? "idioma" : falta.id);
    if (jaDito) {
      // Quem trava é um ERRO, diga a linha o que disser: um «aviso» amarelo
      // ao lado de um botão desligado manda dois recados contrários.
      if (falta.trava) {
        jaDito.trava = true;
        jaDito.severidade = "erro";
      }
      continue;
    }
    v.push({
      id: falta.id,
      titulo: falta.texto,
      severidade: falta.trava ? "erro" : "aviso",
      detalhe: "",
      seccao: falta.seccao,
      campo: falta.campo,
      trava: falta.trava,
    });
  }

  // Onde é que cada assunto se resolve. Uma tabela e não um campo repetido em
  // catorze `push`: catorze sítios onde a mesma resposta podia divergir.
  for (const x of v) {
    const onde = ONDE_SE_RESOLVE[x.id];
    if (onde && !x.seccao) {
      x.seccao = onde.seccao;
      x.campo = onde.campo;
    }
  }

  // O que TRAVA primeiro. É uma lista para agir, e o que impede o envio é o
  // que ela tem de fazer já — procurá-lo entre doze linhas era a razão de a
  // frase estática existir.
  return [...v.filter((x) => x.trava), ...v.filter((x) => !x.trava)];
}

/** Há alguma coisa a que valha a pena olhar antes de carregar em enviar? */
export function temReparos(vs: Verificacao[]): boolean {
  return vs.some((x) => x.severidade !== "ok");
}
