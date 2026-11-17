/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TECTOS DO VERCEL BLOB — a regra, sem servidor (16/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Regra da casa (`.claude/rules/custo.md`): «todo o recurso pago por uso tem
 * de ter, no código, um travão que impeça passar do gratuito — e um aviso
 * antes de lá chegar». O Blob paga-se do crédito mensal do Pro; os tectos são
 * os que o dono fixou para que esse crédito nunca seja tocado a sério:
 *
 *  | o quê                                  | aviso   | travão  |
 *  |----------------------------------------|---------|---------|
 *  | armazenamento (guardado, não por mês)  | 1,5 GB  | 2 GB    |
 *  | operações avançadas por mês            | 40 000  | 50 000  |
 *  | operações simples por mês              | 240 000 | 300 000 |
 *  | transferência por mês                  | 4 GB    | 5 GB    |
 *
 * Avançadas = carregar, copiar, listar (e emitir um testemunho de assinatura,
 * que contamos aqui por prudência). Simples = ler os metadados (`head`) e cada
 * leitura que falhe a cache da Vercel — contamos TODAS as leituras como falha,
 * que é o pior caso. Apagar é de graça.
 *
 * O que o travão faz: uma ESCRITA recusada vai para o Supabase (nunca se perde
 * uma fotografia por causa de um tecto); uma LEITURA recusada volta ao
 * Supabase, e só falha se o ficheiro já lá não estiver.
 */

export const GB = 1024 ** 3;

export const TECTOS = {
  bytes: { aviso: 1.5 * GB, travao: 2 * GB },
  avancadas: { aviso: 40_000, travao: 50_000 },
  simples: { aviso: 240_000, travao: 300_000 },
  transferencia: { aviso: 4 * GB, travao: 5 * GB },
} as const;

/** O que se gastou. `bytes` é o que está guardado; o resto é do mês `mes`. */
export interface UsoDoBlob {
  /** `AAAA-MM` (UTC). Muda o mês, os contadores do mês voltam a zero. */
  mes: string;
  avancadas: number;
  simples: number;
  /** Bytes lidos do Blob este mês. */
  transferencia: number;
  /** Bytes guardados no Blob agora (não volta a zero com o mês). */
  bytes: number;
}

/** O que uma operação vai gastar. Tudo opcional: só se soma o que se diz. */
export interface Gasto {
  avancadas?: number;
  simples?: number;
  transferencia?: number;
  /** Positivo ao guardar, negativo ao apagar. */
  bytes?: number;
}

export function mesDe(agora: Date): string {
  return agora.toISOString().slice(0, 7);
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
}

/**
 * Lê o que está guardado em `app_state`, à prova de lixo, e põe os contadores
 * do mês a zero quando o mês mudou. O `bytes` atravessa os meses.
 */
export function usoNormalizado(v: unknown, agora: Date): UsoDoBlob {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const mes = mesDe(agora);
  const doMes = o.mes === mes;
  return {
    mes,
    avancadas: doMes ? n(o.avancadas) : 0,
    simples: doMes ? n(o.simples) : 0,
    transferencia: doMes ? n(o.transferencia) : 0,
    bytes: n(o.bytes),
  };
}

export function somar(uso: UsoDoBlob, g: Gasto): UsoDoBlob {
  return {
    mes: uso.mes,
    avancadas: uso.avancadas + Math.max(0, g.avancadas ?? 0),
    simples: uso.simples + Math.max(0, g.simples ?? 0),
    transferencia: uso.transferencia + Math.max(0, g.transferencia ?? 0),
    bytes: Math.max(0, uso.bytes + (g.bytes ?? 0)),
  };
}

export type Recusa =
  | "armazenamento"
  | "operacoes-avancadas"
  | "operacoes-simples"
  | "transferencia"
  /** O contador não se leu: sem saber quanto se gastou, não se gasta mais. */
  | "contador-ilegivel";

/**
 * Esta operação cabe? Recusa se, DEPOIS dela, algum contador que ela toca
 * passasse do travão. Só se olha para o que a operação gasta: uma leitura não
 * é recusada por o armazenamento estar cheio, nem um apagar por coisa nenhuma.
 */
export function podeGastar(
  uso: UsoDoBlob,
  g: Gasto,
): { pode: true } | { pode: false; motivo: Recusa } {
  const depois = somar(uso, g);
  if ((g.bytes ?? 0) > 0 && depois.bytes > TECTOS.bytes.travao)
    return { pode: false, motivo: "armazenamento" };
  if ((g.avancadas ?? 0) > 0 && depois.avancadas > TECTOS.avancadas.travao)
    return { pode: false, motivo: "operacoes-avancadas" };
  if ((g.simples ?? 0) > 0 && depois.simples > TECTOS.simples.travao)
    return { pode: false, motivo: "operacoes-simples" };
  if ((g.transferencia ?? 0) > 0 && depois.transferencia > TECTOS.transferencia.travao)
    return { pode: false, motivo: "transferencia" };
  return { pode: true };
}

const fmtGB = (b: number) => `${(b / GB).toLocaleString("pt-PT", { maximumFractionDigits: 2 })} GB`;
const fmtN = (x: number) => Math.round(x).toLocaleString("pt-PT");

/**
 * As frases de aviso, em português, para o ecrã que já mostra a ocupação do
 * armazenamento. Vazio quando está tudo abaixo do aviso — um aviso que aparece
 * sempre deixa de ser lido.
 */
export function avisosDoBlob(uso: UsoDoBlob): string[] {
  const out: string[] = [];
  const linha = (
    valor: number,
    t: { aviso: number; travao: number },
    oQue: string,
    fmt: (x: number) => string,
    depois: string,
  ) => {
    if (valor < t.aviso) return;
    const parado = valor >= t.travao;
    out.push(
      `Vercel Blob: ${oQue} ${fmt(valor)} de ${fmt(t.travao)}` +
        (parado ? ` — parado: ${depois}` : " — perto do tecto."),
    );
  };
  linha(uso.bytes, TECTOS.bytes, "guardado", fmtGB, "o que se guardar vai para o Supabase.");
  linha(
    uso.avancadas,
    TECTOS.avancadas,
    "operações de escrita este mês",
    fmtN,
    "as escritas vão para o Supabase até ao mês que vem.",
  );
  linha(
    uso.simples,
    TECTOS.simples,
    "leituras este mês",
    fmtN,
    "as leituras do Blob param até ao mês que vem.",
  );
  linha(
    uso.transferencia,
    TECTOS.transferencia,
    "transferido este mês",
    fmtGB,
    "as leituras do Blob param até ao mês que vem.",
  );
  return out;
}
