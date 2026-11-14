/**
 * As contas do espaço no armazenamento — puras, sem servidor, para o ecrã e
 * os testes poderem usar EXACTAMENTE as mesmas. A leitura e a medição estão em
 * `ocupacao-do-armazenamento.ts`.
 */

/**
 * O plano gratuito do Supabase: 1 GB de ficheiros. Conta-se em bytes
 * decimais (10⁹), que é o MENOR dos dois «GB» possíveis — pelo lado seguro.
 */
export const LIMITE_DO_PLANO_BYTES = 1_000_000_000;

/** O travão: nunca passar daqui (pedido dele: «muito abaixo»). */
export const TRAVAO = 0.9;

/**
 * Quanto ocupa uma fotografia NOVA de proposta, medido a 13/11 com 49
 * fotografias reais de `public/imagens` (de 2 400–2 560 px): original 1 800 px
 * JPEG q0,82 (354 KB) + média 1 200 px WebP (~115 KB) + miniatura 400 px WebP
 * (15 KB) ≈ 0,47 MB. Arredonda-se para 0,5 MB, pelo lado seguro. Num Safari
 * (que não codifica WebP) a média e a miniatura saem em JPEG: ~0,52 MB.
 */
export const BYTES_POR_FOTO_NOVA = 500_000;

export interface Ocupacao {
  medidoEm: string;
  /** A soma dos buckets conhecidos. */
  bytes: number;
  porBucket: Record<string, { bytes: number; medidoEm: string }>;
  /** Todos os buckets têm medição recente. */
  completo: boolean;
}

export interface EspacoNoArmazenamento {
  /** Há medição completa? Sem ela, nada de tectos grandes. */
  conhecido: boolean;
  limite: number;
  /** {@link TRAVAO} × limite. */
  travao: number;
  /** Medido de noite + carregado desde então. */
  ocupado: number;
  /** Até ao travão (nunca negativo). */
  sobra: number;
  medidoEm: string | null;
}

/** O que se carregou depois da medição: total de um contador por bucket. */
export function somaDoContador(desde: unknown): number {
  if (typeof desde === "number") return Number.isFinite(desde) && desde > 0 ? desde : 0;
  if (!desde || typeof desde !== "object") return 0;
  let s = 0;
  for (const v of Object.values(desde as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) s += n;
  }
  return s;
}

export function espacoQueSobra(
  ocupacao: Ocupacao | null,
  desde: unknown,
  limite = LIMITE_DO_PLANO_BYTES,
  travao = TRAVAO,
): EspacoNoArmazenamento {
  const tecto = Math.floor(limite * travao);
  if (!ocupacao || !Number.isFinite(ocupacao.bytes)) {
    return { conhecido: false, limite, travao: tecto, ocupado: 0, sobra: 0, medidoEm: null };
  }
  const ocupado = Math.max(0, ocupacao.bytes) + somaDoContador(desde);
  return {
    conhecido: ocupacao.completo === true,
    limite,
    travao: tecto,
    ocupado,
    sobra: Math.max(0, tecto - ocupado),
    medidoEm: ocupacao.medidoEm ?? null,
  };
}

/**
 * Quantas fotografias NOVAS uma importação pode subir: o tecto da importação,
 * ou menos se o espaço até ao travão não chegar. Sem medição completa fica o
 * tecto antigo, prudente ({@link TECTO_SEM_MEDICAO}).
 */
export const TECTO_SEM_MEDICAO = 20;

export function fotosQueCabem(
  espaco: EspacoNoArmazenamento | null,
  tectoDaImportacao: number,
  bytesPorFoto = BYTES_POR_FOTO_NOVA,
): number {
  if (!espaco || !espaco.conhecido) return Math.min(tectoDaImportacao, TECTO_SEM_MEDICAO);
  return Math.max(0, Math.min(tectoDaImportacao, Math.floor(espaco.sobra / bytesPorFoto)));
}
