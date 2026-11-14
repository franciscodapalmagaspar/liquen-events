import type { CalendarEvent, CalendarEventKind, Quote, QuoteStatus } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «TEMOS LIVRE EM JULHO DE 2027?»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * É a pergunta comercial mais frequente da casa — chega um pedido de um casal
 * para uma data e a resposta tem de sair no minuto — e até aqui não havia ecrã
 * nenhum que lhe respondesse. A grelha do mês responde a «o que há no dia 12»;
 * para saber se um mês inteiro está tomado era preciso navegar mês a mês e
 * contar à vista. A vista de ano do `docs/APPLE-CALENDARIO.md` (fase 07)
 * existe para isso, e este módulo é a conta que a alimenta.
 *
 * Não desenha nada e não decide nada por ela. Diz, para cada dia do ano, se
 * está FECHADO, se tem MARCAÇÕES ou se está LIVRE — e agrupa isso por mês, que
 * é a unidade em que a pergunta se faz.
 *
 * ── O QUE FECHA UM DIA, E PORQUÊ ESTAS QUATRO COISAS ───────────────────────
 *
 * O critério é o mesmo do `choque-de-datas.ts`, e não por gosto de simetria:
 * são as duas peças que respondem à mesma pergunta («este dia dá?») e duas
 * respostas diferentes sobre o mesmo dia seriam pior do que não haver nenhuma.
 *
 *   · pedido em `cotado` ou `aceite` — proposta ENVIADA ou negócio GANHO. É
 *     compromisso: há um preço na mão do cliente ou um sinal pago.
 *   · marcação de tipo `bloqueio` — chama-se «Data fechada» no ecrã e é
 *     literalmente isso: férias, uma folga da equipa, um dia que ela tirou.
 *   · marcação de tipo `evento` — um evento marcado à mão no calendário, sem
 *     pedido por trás. A equipa está lá nesse dia como estaria num casamento.
 *
 * E o que NÃO fecha, com a mesma razão a pesar:
 *
 *   · pedido `pendente`, `em_revisao` ou `a_preparar` — o casal ainda não tem
 *     proposta nenhuma na mão (a que está a preparar ainda não seguiu). Se
 *     um pedido por responder fechasse o dia, dois pedidos para a mesma data
 *     fechavam-se um ao outro e um ano com procura passava a ler-se como um
 *     ano cheio. Contam como MARCAÇÃO: estão lá, vêem-se, e não impedem nada.
 *   · pedido `rejeitado` — um trabalho perdido não ocupa dia nenhum. É a
 *     mesma decisão que já está tomada na lista dos «Próximos eventos» do
 *     `Calendario.tsx`, e pela mesma razão: um casamento que vai acontecer sem
 *     a Líquen lá não é um dia da Líquen.
 *   · pedido arquivado — saiu da vista em todos os outros ecrãs; não volta por
 *     esta porta.
 *   · marcação de tipo `reuniao` ou `nota` — uma reunião é uma hora e uma nota
 *     é um lembrete. Nenhuma das duas impede um casamento nesse dia.
 *
 * ── PORQUE É QUE O CORTE DOS EVENTOS DE VÁRIOS DIAS É 31 E NÃO 30 ──────────
 *
 * Porque é o da grelha do mês (o `byDay` do `Calendario.tsx`), e as duas
 * vistas do MESMO ecrã não podem discordar sobre quantos dias um casamento
 * ocupa. O `choque-de-datas.ts` usa 30 — é outra pergunta, feita sobre um
 * pedido só, e o dia a mais não muda resposta nenhuma lá. Aqui mudava: um
 * evento desenhado em Julho na vista de mês e ausente de Julho na vista de ano
 * é a maneira mais rápida de a vista de ano deixar de merecer confiança.
 */

/** Estados de pedido que COMPROMETEM o dia. Ver o cabeçalho. */
const COMPROMETEM: readonly QuoteStatus[] = ["cotado", "aceite"];

/** Tipos de marcação que ocupam o DIA INTEIRO. Ver o cabeçalho. */
const FECHAM_O_DIA: readonly CalendarEventKind[] = ["bloqueio", "evento"];

/**
 * O limite de dias de um evento de vários dias — o mesmo da grelha do mês.
 * Um «evento» de mais de um mês é um engano de escrita, e percorrê-lo dia a
 * dia seria dar-lhe crédito.
 */
const MAXIMO_DE_DIAS = 31;

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

/**
 * OS DIAS DA SEMANA, COM A SEMANA A COMEÇAR À SEGUNDA — uma lista só.
 *
 * Havia três a dizer o mesmo no mesmo ecrã: o `WEEKDAYS` do `Calendario.tsx`
 * (os três caracteres do cabeçalho da grelha do mês), o `INICIAIS` do
 * `CalendarioAno.tsx` (a inicial e o nome por extenso dos mini-meses), e a
 * vista de semana ia acrescentar uma quarta. Três listas a nomear os mesmos
 * sete dias é como se descobre, um dia, que uma delas começa ao domingo.
 *
 * O `curto` é o que a grelha do mês escreve; a INICIAL é o `curto[0]`, e não
 * um terceiro campo — «Seg» e «S» não podem discordar se um deles for
 * derivado do outro. O `nome` é o que vai nos rótulos acessíveis, porque as
 * iniciais repetem-se (S/T/Q/Q/S/S/D) e sozinhas não se leriam.
 *
 * Segunda-feira primeiro: locale `pt-PT`, Parte 9.6 do sistema de design.
 */
export const DIAS_DA_SEMANA = [
  { curto: "Seg", nome: "Segunda-feira" },
  { curto: "Ter", nome: "Terça-feira" },
  { curto: "Qua", nome: "Quarta-feira" },
  { curto: "Qui", nome: "Quinta-feira" },
  { curto: "Sex", nome: "Sexta-feira" },
  { curto: "Sáb", nome: "Sábado" },
  { curto: "Dom", nome: "Domingo" },
] as const;

export type EstadoDoDia = "livre" | "marcado" | "fechado";

export interface DiaDoAno {
  /** "yyyy-mm-dd". */
  data: string;
  /** O número do dia no mês, 1–31. */
  dia: number;
  estado: EstadoDoDia;
  /**
   * Quantas coisas caem neste dia, contadas por IDENTIDADE — um casamento de
   * três dias é um evento em cada um dos três, e nunca três no mesmo.
   */
  quantas: number;
}

export interface MesDoAno {
  /** 0–11, como no `Date`. */
  mes: number;
  nome: string;
  /**
   * Quantas células vazias vêm antes do dia 1 numa grelha de sete colunas com
   * a semana a começar à SEGUNDA (locale `pt-PT`, Parte 9.6 do sistema de
   * design). Zero quando o dia 1 cai a uma segunda-feira.
   */
  desvio: number;
  dias: DiaDoAno[];
  /** Quantos dias do mês estão fechados. É o número que responde à pergunta. */
  fechados: number;
  /** Quantos dias têm marcações sem estarem fechados. */
  marcados: number;
}

/** "2027-07-18" e nada mais — o campo da data aceita texto ("a definir"). */
function ehData(v: string | undefined | null): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * Soma dias a uma data "yyyy-mm-dd", devolvendo no mesmo formato.
 *
 * Exportada porque a vista de semana precisa de recuar até à segunda-feira e
 * de avançar sete dias a partir dela (`diasDaSemana`, no
 * `dia-do-calendario.ts`). Escrever a mesma conta lá era ter duas maneiras de
 * somar um dia no mesmo ecrã — e são precisamente as contas de datas que
 * discordam em silêncio quando muda a hora legal.
 */
export function maisDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Os dias que um pedido ocupa: a data, e todas as do intervalo quando é de
 * vários dias. Vazio quando a data não é uma data.
 */
function diasDoPedido(q: Quote): string[] {
  if (!ehData(q.date)) return [];
  const fim = ehData(q.endDate) && q.endDate >= q.date ? q.endDate : q.date;
  const dias: string[] = [];
  for (let d = q.date, i = 0; d <= fim && i < MAXIMO_DE_DIAS; d = maisDias(d, 1), i += 1) {
    dias.push(d);
  }
  return dias;
}

/**
 * Um pedido que conta para o calendário — nem arquivado, nem perdido.
 *
 * Exportada (auditoria de 14/11, n.º 17): as contagens do mês, da semana e do
 * dia somavam os pedidos PERDIDOS que a grelha desenha a cinzento, e o cartão
 * do mesmo mês na vista de ano não os somava — «2 eventos este mês» num mês
 * que o ano dizia ter um dia com marcações. A regra fica aqui, e as quatro
 * vistas contam por ela.
 */
export function contaParaOCalendario(q: Quote): boolean {
  return !q.archived && q.status !== "rejeitado";
}

/**
 * O ano inteiro, mês a mês, com o estado de cada dia.
 *
 * `quotes` e `marcacoes` podem trazer anos inteiros de dados: o que não cair
 * dentro de `ano` é ignorado sem custo, e o resultado tem sempre doze meses —
 * um ano sem nada marcado desenha-se na mesma, com doze meses livres.
 */
export function anoDoCalendario(
  ano: number,
  quotes: readonly Quote[],
  marcacoes: readonly CalendarEvent[],
): MesDoAno[] {
  const prefixo = `${ano}-`;
  /** Por dia: quantas coisas lá caem, e se alguma delas o fecha. */
  const porDia = new Map<string, { quantas: number; fechado: boolean }>();

  const somar = (data: string, fecha: boolean) => {
    if (!data.startsWith(prefixo)) return;
    const actual = porDia.get(data);
    if (actual) {
      actual.quantas += 1;
      actual.fechado ||= fecha;
    } else {
      porDia.set(data, { quantas: 1, fechado: fecha });
    }
  };

  for (const q of quotes) {
    if (!contaParaOCalendario(q)) continue;
    const fecha = COMPROMETEM.includes(q.status);
    for (const dia of diasDoPedido(q)) somar(dia, fecha);
  }

  for (const m of marcacoes) {
    if (!ehData(m.date)) continue;
    somar(m.date, FECHAM_O_DIA.includes(m.kind));
  }

  return MESES.map((nome, mes) => {
    // O dia 0 do mês seguinte é o último deste — a forma de contar os dias de
    // Fevereiro sem escrever a regra dos anos bissextos à mão.
    const quantosDias = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    // `getUTCDay()` dá 0 ao domingo; a semana desta casa começa à segunda.
    const desvio = (new Date(Date.UTC(ano, mes, 1)).getUTCDay() + 6) % 7;

    const dias: DiaDoAno[] = [];
    let fechados = 0;
    let marcados = 0;
    for (let dia = 1; dia <= quantosDias; dia += 1) {
      const data = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      const doDia = porDia.get(data);
      const estado: EstadoDoDia = !doDia ? "livre" : doDia.fechado ? "fechado" : "marcado";
      if (estado === "fechado") fechados += 1;
      else if (estado === "marcado") marcados += 1;
      dias.push({ data, dia, estado, quantas: doDia?.quantas ?? 0 });
    }

    return { mes, nome, desvio, dias, fechados, marcados };
  });
}

/** "1 dia" / "3 dias" — o plural escrito uma vez só. */
function dias(n: number): string {
  return `${n} dia${n === 1 ? "" : "s"}`;
}

/**
 * A linha por baixo do nome do mês — e a peça que faz a pergunta responder-se
 * em menos de três segundos (critério 7 da Parte 9 do documento).
 *
 * O que ela lá tem de ler NÃO é a grelha de trinta pontos: é uma palavra. Doze
 * linhas destas, uma por mês, respondem a «temos livre em Julho?» sem contar
 * nada — e são texto, portanto respondem também a quem não distingue os tons
 * dos dias na grelha ao lado (Parte 10: nada se comunica só por cor).
 */
export function resumoDoMes(m: MesDoAno): string {
  if (m.fechados === 0 && m.marcados === 0) return "Livre";
  if (m.fechados === 0) return `${dias(m.marcados)} com marcações`;
  const fechados = `${dias(m.fechados)} fechado${m.fechados === 1 ? "" : "s"}`;
  return m.marcados === 0 ? fechados : `${fechados} · ${m.marcados} com marcações`;
}

/**
 * O nome acessível de um dia da grelha do ano.
 *
 * Diz o dia, o mês, o ANO e o ESTADO POR EXTENSO. O ano vai lá dentro pela
 * mesma razão por que já vai no nome das células da grelha do mês: esta casa
 * fecha datas com ano e meio de antecedência, e quem percorre a grelha com um
 * leitor de ecrã não pode depender de ter ouvido o cabeçalho lá atrás.
 *
 * O estado por extenso é o que cumpre a proibição da Parte 10 — «nada de
 * comunicar estado só por cor». Na grelha, um dia fechado é um disco cheio e
 * um dia marcado é um ponto; aqui é a palavra «fechado», que não depende nem
 * de cor nem de forma nem de ver.
 */
export function nomeDoDia(d: DiaDoAno, nomeDoMes: string, ano: number): string {
  const onde = `${d.dia} de ${nomeDoMes} de ${ano}`;
  if (d.estado === "livre") return `${onde} — livre`;
  const quantas = `${d.quantas} marcaç${d.quantas === 1 ? "ão" : "ões"}`;
  if (d.estado === "fechado") return `${onde} — dia fechado, ${quantas}`;
  return `${onde} — livre, com ${quantas}`;
}

/**
 * Quantos dias do ano estão fechados. É o estado da vista, ao lado do título,
 * e é o que substitui o «N eventos este mês» quando se troca para o ano.
 */
export function fechadosNoAno(meses: readonly MesDoAno[]): number {
  return meses.reduce((soma, m) => soma + m.fechados, 0);
}
