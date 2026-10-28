/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTACTO DE QUEM PEDE UM ORÇAMENTO — a regra, num sítio só
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (28/10): chegou um pedido com o email mal escrito («candmcasmento…» em
 * vez do que a pessoa queria), a confirmação nunca chegou, e não havia mais
 * por onde lhe responder. Decidiu: no formulário completo, **email e telemóvel
 * passam a ser os dois obrigatórios** — as fichas rápidas dos anúncios ficam
 * como estão (um campo só).
 *
 * Puro e sem dependências: o formulário pergunta isto no browser (sem trazer o
 * zod) e o servidor faz a MESMA pergunta (`quoteFormSchema`). Duas regras
 * parecidas acabavam a discordar — e o pior caso é o browser dizer «está bem»
 * e o servidor recusar depois do clique.
 *
 * ── O TELEMÓVEL ─────────────────────────────────────────────────────────────
 *
 * Os números chegam escritos de todas as maneiras (+351, 00351, com espaços,
 * pontos, parênteses). Normaliza-se para E.164 (`+351912345678`), que é a
 * forma que o WhatsApp, a Meta e o Google Ads já aceitam.
 *
 *   · sem indicativo: tem de ser um número português — 9 dígitos a começar por
 *     9 (móvel) ou por 2/3 (fixo). Um estrangeiro escreve o «+» do país;
 *   · com «+» ou «00»: o indicativo e o número, de 8 a 15 dígitos (o máximo do
 *     E.164). Com +351, outra vez exactamente 9 dígitos a começar por 9, 2 ou 3.
 *
 * Não se tenta adivinhar mais do que isto: uma regra apertada por país recusa
 * números verdadeiros, e o que se quer apanhar é o dedo que escorregou (um
 * dígito a menos, a mais, ou um número que não é português sem indicativo).
 */

/** O número em E.164 (`+351912345678`), ou `null` se não parecer completo. */
export function normalizarTelefone(bruto: string): string | null {
  const limpo = (bruto ?? "").trim().replace(/[\s.\-()/]/g, "");
  if (!limpo) return null;
  let internacional: string | null = null;
  if (limpo.startsWith("+")) internacional = limpo.slice(1);
  else if (limpo.startsWith("00")) internacional = limpo.slice(2);
  if (internacional !== null) {
    if (!/^\d+$/.test(internacional)) return null;
    if (internacional.startsWith("351")) {
      const nacional = internacional.slice(3);
      return /^[239]\d{8}$/.test(nacional) ? `+351${nacional}` : null;
    }
    // O primeiro dígito de um indicativo nunca é 0.
    return /^[1-9]\d{7,14}$/.test(internacional) ? `+${internacional}` : null;
  }
  if (!/^\d+$/.test(limpo)) return null;
  return /^[239]\d{8}$/.test(limpo) ? `+351${limpo}` : null;
}

// ── O EMAIL: domínios mal escritos ─────────────────────────────────────────
//
// O engano que chegou estava ANTES do @ — isso nenhuma máquina apanha, e é por
// isso que o formulário mostra os contactos para confirmar antes de enviar.
// Mas o outro engano comum é DEPOIS do @ («gmial.com», «hotmal.com»), e esse
// apanha-se: sugere-se o domínio certo, sem o trocar sozinho.

const DOMINIOS = [
  "gmail.com",
  "hotmail.com",
  "hotmail.pt",
  "outlook.com",
  "outlook.pt",
  "live.com.pt",
  "live.com",
  "icloud.com",
  "me.com",
  "yahoo.com",
  "sapo.pt",
  "netcabo.pt",
  "msn.com",
  "protonmail.com",
] as const;

/** Distância de edição (inserir, apagar, trocar uma letra, ou trocar duas vizinhas). */
function distancia(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/**
 * O email com o domínio corrigido («ana@gmail.com» para «ana@gmial.com»), ou
 * `null` quando o domínio já é um dos conhecidos ou não se parece com nenhum.
 */
export function sugestaoDeEmail(email: string): string | null {
  const e = (email ?? "").trim();
  const arroba = e.lastIndexOf("@");
  if (arroba < 1) return null;
  const local = e.slice(0, arroba);
  const dominio = e.slice(arroba + 1).toLowerCase();
  if (!dominio || (DOMINIOS as readonly string[]).includes(dominio)) return null;
  let melhor: string | null = null;
  let menor = Infinity;
  for (const d of DOMINIOS) {
    const n = distancia(dominio, d);
    if (n < menor) {
      menor = n;
      melhor = d;
    }
  }
  // Até 2 enganos num domínio comprido; 1 num curto (evita «me.com» → «msn.com»).
  const limite = dominio.length >= 8 ? 2 : 1;
  return melhor && menor > 0 && menor <= limite ? `${local}@${melhor}` : null;
}
