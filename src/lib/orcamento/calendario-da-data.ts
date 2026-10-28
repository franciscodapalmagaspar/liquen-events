/**
 * As contas do calendário da «Data do evento» (pedido de orçamento).
 *
 * Tudo em texto `AAAA-MM-DD` — o mesmo formato do `<input type="date">` que o
 * campo continua a ser no telemóvel, e o que o formulário guarda e envia. As
 * datas fazem-se sempre com `new Date(ano, mês, dia)` no fuso de quem preenche,
 * nunca com `toISOString()`: esse é UTC, e passada a meia-noite em Lisboa
 * daria o dia de ontem (o mesmo defeito que o `hojeNoFusoDela` do formulário
 * já corrige para o `min`).
 *
 * Puro, sem React, para se testar sozinho.
 */

export type Dia = { iso: string; dia: number; doMes: boolean };

const doisDigitos = (n: number) => String(n).padStart(2, "0");

export function isoDe(ano: number, mes: number, dia: number): string {
  const d = new Date(ano, mes, dia);
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

/** `null` para um texto que não é uma data a sério (31 de fevereiro, vazio…). */
export function partesDe(iso: string): { ano: number; mes: number; dia: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]) - 1;
  const dia = Number(m[3]);
  return isoDe(ano, mes, dia) === iso ? { ano, mes, dia } : null;
}

export function dataDe(iso: string): Date {
  const p = partesDe(iso);
  return p ? new Date(p.ano, p.mes, p.dia) : new Date(NaN);
}

export function somarDias(iso: string, n: number): string {
  const p = partesDe(iso);
  return p ? isoDe(p.ano, p.mes, p.dia + n) : iso;
}

/**
 * O mesmo dia noutro mês — e, quando esse mês é mais curto, o último dia dele
 * (31 de janeiro + 1 mês = 28/29 de fevereiro, e não 3 de março).
 */
export function somarMeses(iso: string, n: number): string {
  const p = partesDe(iso);
  if (!p) return iso;
  const ultimo = new Date(p.ano, p.mes + n + 1, 0).getDate();
  return isoDe(p.ano, p.mes + n, Math.min(p.dia, ultimo));
}

/**
 * Seis semanas, a começar à segunda-feira, como o calendário do telemóvel em
 * Portugal. Sempre seis, para o quadro não mudar de altura de um mês para o
 * outro — mudar de mês não pode empurrar a página.
 */
export function semanasDoMes(ano: number, mes: number): Dia[][] {
  const primeiro = new Date(ano, mes, 1);
  // getDay: 0 = domingo. Recuar até à segunda-feira.
  const recuo = (primeiro.getDay() + 6) % 7;
  const semanas: Dia[][] = [];
  for (let s = 0; s < 6; s++) {
    const semana: Dia[] = [];
    for (let d = 0; d < 7; d++) {
      const data = new Date(ano, mes, 1 - recuo + s * 7 + d);
      semana.push({
        iso: isoDe(data.getFullYear(), data.getMonth(), data.getDate()),
        dia: data.getDate(),
        doMes: data.getMonth() === mes,
      });
    }
    semanas.push(semana);
  }
  return semanas;
}

/** O início e o fim da semana (segunda a domingo) em que o dia está. */
export function inicioDaSemana(iso: string): string {
  const d = dataDe(iso);
  return somarDias(iso, -((d.getDay() + 6) % 7));
}
export function fimDaSemana(iso: string): string {
  return somarDias(inicioDaSemana(iso), 6);
}

/** O mês (`AAAA-MM`) por onde o calendário abre: o da data escolhida, senão o de hoje. */
export function mesInicial(valor: string, hoje: string): { ano: number; mes: number } {
  const p = partesDe(valor) ?? partesDe(hoje) ?? { ano: new Date().getFullYear(), mes: 0, dia: 1 };
  return { ano: p.ano, mes: p.mes };
}

/** «Outubro 2026» — o título do mês, como no calendário do iPhone. */
export function tituloDoMes(ano: number, mes: number, locale: string): string {
  const nome = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(ano, mes, 1));
  return `${nome.charAt(0).toLocaleUpperCase(locale)}${nome.slice(1)} ${ano}`;
}

/** As iniciais dos dias da semana (S T Q Q S S D), da segunda ao domingo, e os nomes inteiros. */
export function diasDaSemana(locale: string): { inicial: string; nome: string }[] {
  // 3 de janeiro de 2022 foi uma segunda-feira.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2022, 0, 3 + i);
    return {
      inicial: new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(d),
      nome: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(d),
    };
  });
}

/** «sábado, 24 de julho de 2027» — o que o leitor de ecrã diz de cada dia. */
export function dataPorExtenso(iso: string, locale: string): string {
  const d = dataDe(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** «sáb., 24 de julho de 2027» — o que fica escrito no campo, mais curto. */
export function dataNoCampo(iso: string, locale: string): string {
  const d = dataDe(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Os nomes dos doze meses, para a vista de meses. */
export function nomesDosMeses(locale: string): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const n = new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(2022, i, 1));
    return `${n.charAt(0).toLocaleUpperCase(locale)}${n.slice(1)}`.replace(/\.$/, "");
  });
}
