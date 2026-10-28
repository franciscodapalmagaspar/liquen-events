import "server-only";
import { assinarLote } from "@/lib/proposal-assinaturas";
import {
  THEME_AVIF_BUCKET,
  THEME_AVIF_MICRO_BUCKET,
  THEME_AVIF_MID_BUCKET,
  THEME_BUCKET,
  THEME_MICRO_BUCKET,
  THEME_MID_BUCKET,
  THEME_SIGNED_TTL,
  THEME_THUMB_BUCKET,
} from "@/lib/theme-ref";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOS DE TEMA NO RETRATO: GUARDA-SE O CAMINHO, ASSINA-SE AO LER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (28/10), sobre a proposta online a abrir depois de estar parada: «sim».
 *
 * As fotografias da biblioteca de temas assinam-se por seis horas
 * (`THEME_SIGNED_TTL` — a razão, de segurança, está no `theme-ref.ts` e não
 * muda). O retrato da página guardava os endereços já assinados, por isso
 * morria com o primeiro deles: um casal que abrisse o email no dia seguinte
 * apanhava a página a montar-se outra vez do princípio — o motor do PDF, o
 * `sharp`, uma dúzia de idas ao armazenamento. Medido a 28/10: 7,5 s, contra
 * 0,6 s com o retrato válido.
 *
 * Agora o retrato guarda, no lugar de cada endereço de tema, um marcador com o
 * bucket e o caminho; ao ler, os marcadores assinam-se de novo — um lote por
 * bucket, em paralelo, com o MESMO prazo de seis horas. As fotos do próprio
 * pedido (dez anos) ficam como estavam. Assim o retrato deixa de depender das
 * fotos de tema, e uma visita nunca espera pela montagem por causa delas.
 */

/** Os buckets da biblioteca, lidos das constantes — nunca escritos à mão. */
const BUCKETS_DE_TEMA = [
  THEME_BUCKET,
  THEME_MID_BUCKET,
  THEME_THUMB_BUCKET,
  THEME_MICRO_BUCKET,
  THEME_AVIF_BUCKET,
  THEME_AVIF_MICRO_BUCKET,
  THEME_AVIF_MID_BUCKET,
];

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Um endereço assinado do Supabase para um bucket de tema. O caminho vai até
 * ao `?`; o token é um JWT (três partes base64url). Os buckets mais compridos
 * primeiro, para `theme-avif-medias` não ser lido como `theme-avif`.
 */
const ENDERECO_DE_TEMA = new RegExp(
  `https?://[^"\\s?]+?/storage/v1/object/sign/(${[...BUCKETS_DE_TEMA]
    .sort((a, b) => b.length - a.length)
    .map(escapar)
    .join("|")})/([^"\\s?]+)\\?token=[\\w-]+\\.[\\w-]+\\.[\\w-]+`,
  "g",
);

/** `]` e `|` nunca aparecem por codificar num caminho de URL. */
const MARCADOR = /~LIQUEN-TEMA\[([a-z0-9-]+)\|([^\]]+)\]~/g;

const marcador = (bucket: string, caminho: string) => `~LIQUEN-TEMA[${bucket}|${caminho}]~`;

/** Troca cada endereço assinado de tema pelo seu marcador. */
export function tirarAssinaturasDeTema(json: string): string {
  return json.replace(ENDERECO_DE_TEMA, (_, bucket: string, caminho: string) =>
    marcador(bucket, caminho),
  );
}

export function temAssinaturasPorFazer(json: string): boolean {
  return json.includes("~LIQUEN-TEMA[");
}

/**
 * Assina de novo os marcadores — um lote por bucket, em paralelo. Devolve
 * `null` se algum ficar por assinar (armazenamento em baixo): quem chama monta
 * a página como antes, e nunca se entrega um endereço que não abre.
 */
export async function assinarFotosDeTema(json: string): Promise<string | null> {
  const porBucket = new Map<string, Set<string>>();
  for (const [, bucket, caminho] of json.matchAll(MARCADOR)) {
    if (!porBucket.has(bucket)) porBucket.set(bucket, new Set());
    porBucket.get(bucket)!.add(caminho);
  }
  if (porBucket.size === 0) return json;

  const assinados = new Map<string, string>();
  const lotes = await Promise.all(
    [...porBucket].map(async ([bucket, caminhos]) => {
      const lista = [...caminhos];
      const reais = lista.map((c) => decodeURIComponent(c));
      const urls = await assinarLote(bucket, reais, false, THEME_SIGNED_TTL);
      return lista.map((c, i) => [marcador(bucket, c), urls.get(reais[i])] as const);
    }),
  );
  for (const lote of lotes) {
    for (const [m, url] of lote) {
      if (!url) return null;
      assinados.set(m, url);
    }
  }
  return json.replace(MARCADOR, (m) => assinados.get(m) ?? m);
}
