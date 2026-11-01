import type { Quote } from "./types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * D1 — «POSSÍVEL DUPLICADO»: O MESMO PEDIDO FEITO DUAS VEZES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O pedido dela (`docs/FAZER-PROPOSTA-MELHORIAS.md`, D1): na lista apareciam
 * «Ana Serra Lobo» e «Ana lobo», a mesma data, o mesmo local, uma em «Aguardar
 * resposta» e outra em «Novo». Parecia o mesmo pedido feito duas vezes.
 *
 * As três regras são as dela, à letra:
 *   · a MESMA DATA de evento e nomes parecidos — ignorando maiúsculas,
 *     acentos e nomes do meio (o primeiro e o último nome iguais);
 *   · ou o MESMO EMAIL;
 *   · ou o MESMO TELEFONE (os últimos nove algarismos: «+351 912…» e
 *     «912…» são o mesmo número).
 *
 * E as duas proibições também: NUNCA se junta nada sozinho (isto só aponta),
 * e um «não são o mesmo» faz a etiqueta desaparecer e não voltar
 * (`naoDuplicados`, guardado nos dois pedidos).
 *
 * Os arquivados não entram: um pedido arquivado já foi resolvido por ela, e
 * apontar-lhe um gémeo era trazer de volta o que ela tirou da frente.
 */

export type MotivoDoDuplicado = "email" | "telefone" | "nome-e-data";

export interface PossivelDuplicado {
  /** O outro pedido. */
  id: string;
  /** Porque é que parecem o mesmo — o primeiro que bater, pela ordem acima. */
  motivo: MotivoDoDuplicado;
}

/** Sem acentos, sem maiúsculas, sem espaços a mais. */
function limpo(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.+\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O nome que se compara: o primeiro e o último, sem acentos nem maiúsculas.
 * «Ana Serra Lobo» e «Ana lobo» dão os dois `ana lobo`. Um nome de uma só
 * palavra compara-se inteiro.
 */
export function nomeComparavel(nome: string | null | undefined): string | null {
  const partes = limpo(nome)
    .split(" ")
    .filter((p) => p.length > 0 && !/^(de|da|do|das|dos|e|&)$/.test(p));
  if (partes.length === 0) return null;
  return partes.length === 1 ? partes[0] : `${partes[0]} ${partes[partes.length - 1]}`;
}

/** Os últimos nove algarismos — o número sem o indicativo. */
export function telefoneComparavel(tel: string | null | undefined): string | null {
  const d = (tel ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
}

export function emailComparavel(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

/** O dia do evento (aaaa-mm-dd), se houver. */
function diaDoEvento(q: Pick<Quote, "date">): string | null {
  const d = (q.date ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/** Porque é que `a` e `b` parecem o mesmo pedido — ou `null`. */
export function motivoDoDuplicado(
  a: Pick<Quote, "email" | "phone" | "name" | "date">,
  b: Pick<Quote, "email" | "phone" | "name" | "date">,
): MotivoDoDuplicado | null {
  const ea = emailComparavel(a.email);
  if (ea && ea === emailComparavel(b.email)) return "email";
  const ta = telefoneComparavel(a.phone);
  if (ta && ta === telefoneComparavel(b.phone)) return "telefone";
  const da = diaDoEvento(a);
  const na = nomeComparavel(a.name);
  if (da && na && da === diaDoEvento(b) && na === nomeComparavel(b.name)) return "nome-e-data";
  return null;
}

/** Ela disse, num dos dois, que não são o mesmo? */
function separadosPorEla(
  a: Pick<Quote, "id" | "naoDuplicados">,
  b: Pick<Quote, "id" | "naoDuplicados">,
): boolean {
  return (a.naoDuplicados ?? []).includes(b.id) || (b.naoDuplicados ?? []).includes(a.id);
}

/**
 * Para cada pedido com um possível gémeo, quais são. Só os que não estão
 * arquivados, e nunca um par que ela já separou.
 *
 * Quadrático de propósito: são dezenas de pedidos (40 a 1/11), e a regra do
 * nome não se indexa sem inventar chaves que as outras duas não precisam.
 */
export function possiveisDuplicados(
  quotes: ReadonlyArray<
    Pick<Quote, "id" | "email" | "phone" | "name" | "date" | "archived" | "naoDuplicados">
  >,
): Map<string, PossivelDuplicado[]> {
  const vivos = quotes.filter((q) => !q.archived);
  const por = new Map<string, PossivelDuplicado[]>();
  for (let i = 0; i < vivos.length; i++) {
    for (let j = i + 1; j < vivos.length; j++) {
      const a = vivos[i];
      const b = vivos[j];
      if (separadosPorEla(a, b)) continue;
      const motivo = motivoDoDuplicado(a, b);
      if (!motivo) continue;
      por.set(a.id, [...(por.get(a.id) ?? []), { id: b.id, motivo }]);
      por.set(b.id, [...(por.get(b.id) ?? []), { id: a.id, motivo }]);
    }
  }
  return por;
}

/** O porquê, em palavras dela, para a legenda da etiqueta. */
export function porqueParece(motivo: MotivoDoDuplicado): string {
  switch (motivo) {
    case "email":
      return "o mesmo email";
    case "telefone":
      return "o mesmo telefone";
    case "nome-e-data":
      return "o mesmo nome e a mesma data";
  }
}

/** A lista de `naoDuplicados` de `q` com `outro` acrescentado, sem repetir. */
export function separar(q: Pick<Quote, "naoDuplicados">, outro: string): string[] {
  const atual = q.naoDuplicados ?? [];
  return atual.includes(outro) ? atual : [...atual, outro];
}
