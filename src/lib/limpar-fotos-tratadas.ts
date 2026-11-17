import "server-only";
import { balde as abrirBalde } from "@/lib/armazenamento/balde";
import { getSupabase } from "@/lib/supabase";
import { BUCKET_EDITORIAL } from "@/lib/fotos-editoriais-guardadas";
import { semProtegidos } from "@/lib/arquivo-de-pdfs/protegidos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOS TRATADAS VELHAS SAEM (10/11, decisão dela)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: «eu não quero pagar nada» — o Supabase fica no plano gratuito (1 GB de
 * ficheiros), e a 10/11 ia em 928 MB. O balde `fotos-editoriais` é uma CACHE:
 * a fotografia reduzida e a «preparada» para a página do PDF, que se refazem
 * sozinhas se faltarem (`fotos-editoriais-guardadas.ts`,
 * `preparadas-guardadas.ts`; provado em `proposal-doc-render.guardadas.test.ts`
 * e `preparadas-guardadas.test.ts`). Encheu 158 MB numa semana.
 *
 * Todas as noites, na tarefa que já corre (`cron/backup`), sai o que tem mais
 * de {@link DIAS} dias e, acima do {@link TECTO_BYTES}, as mais velhas até
 * caber. Pela IDADE e não pelo último uso: o Supabase não regista as leituras
 * (medido: `last_accessed_at` fica sempre igual à criação). O que ainda estiver
 * em uso refaz-se uma vez — segundos de processador — e volta a ficar.
 *
 * As fotografias ORIGINAIS (`proposal-assets`, `theme-assets`) nunca passam
 * por aqui. Nada disto lança: se falhar, amanhã tenta outra vez.
 */
/**
 * 7 e não 30 (13/11, autorizado por ele: «esvazia a cache»): com 30 dias nada
 * tinha ainda saído (o ficheiro mais antigo era de 3/11) e o balde chegou aos
 * 197 MB, com o armazenamento a 997 MB de 1 GB. Uma proposta em trabalho
 * refaz as suas uma vez por semana — segundos de processador.
 */
export const DIAS = 7;

/**
 * 64 MiB (17/11). Medido nesse dia: 128 MB com a regra dos 7 dias, 85 MB
 * nascidos num só dia de trabalho (16/11) — mais do que os 40 MB de folga que
 * o travão reserva por dia para o que o servidor guarda sozinho, com o plano a
 * 913 MB de 1 GB. Um PDF de 40 fotografias usa ~4–6 MB desta cache: 64 MiB
 * guardam as ~10–15 propostas mais recentes. Nas 24 h medidas houve 1 342
 * leituras com sucesso e 1 187 em falta: a cache trabalha, e por isso o tecto
 * deixa as mais RECENTES (as que ela tem abertas) e leva as mais velhas.
 */
export const TECTO_BYTES = 64 * 1024 * 1024;

/** Quantas pastas se lêem ao mesmo tempo (são 256, de duas letras). */
const EM_PARALELO = 16;
const DIA_MS = 24 * 60 * 60_000;

export type FicheiroDaCache = {
  caminho: string;
  /** ISO, ou `null` quando o Storage não o deu. */
  criado: string | null;
  bytes: number;
};

/**
 * O que sai: tudo o que tem mais de {@link DIAS} dias, e depois, enquanto o que
 * fica passar do tecto, o mais velho primeiro. Um ficheiro sem data conta como
 * o mais velho (é uma cache: apagá-lo de mais só custa refazê-lo). Pura.
 */
export function queSaiDaCache(
  ficheiros: readonly FicheiroDaCache[],
  agora: Date,
  tecto = TECTO_BYTES,
): string[] {
  const limite = agora.getTime() - DIAS * DIA_MS;
  const quando = (f: FicheiroDaCache) => {
    const t = f.criado ? Date.parse(f.criado) : Number.NaN;
    return Number.isNaN(t) ? -Infinity : t;
  };
  const porIdade = [...ficheiros].sort(
    (a, b) => quando(a) - quando(b) || a.caminho.localeCompare(b.caminho),
  );
  const sai: string[] = [];
  let ficam = porIdade.reduce((n, f) => n + f.bytes, 0);
  for (const f of porIdade) {
    if (quando(f) >= limite && ficam <= tecto) break;
    sai.push(f.caminho);
    ficam -= f.bytes;
  }
  return sai;
}

export async function limparFotosTratadasVelhas(
  agora: Date,
  prazoMs = 15_000,
): Promise<{ apagadas: number; pastas: number; acabou: boolean; bytesQueFicam?: number }> {
  const sb = getSupabase();
  if (!sb) return { apagadas: 0, pastas: 0, acabou: true };
  const fim = Date.now() + prazoMs;
  const balde = abrirBalde(BUCKET_EDITORIAL, sb);

  const { data: raiz } = await balde.list("", { limit: 1000 });
  const pastas = (raiz ?? []).filter((e) => !e.id).map((e) => e.name);
  const vistos: FicheiroDaCache[] = [];
  let lidas = 0;

  for (let i = 0; i < pastas.length; i += EM_PARALELO) {
    if (Date.now() > fim) break;
    const lote = pastas.slice(i, i + EM_PARALELO);
    const listas = await Promise.all(
      lote.map(async (pasta) => {
        const { data } = await balde.list(pasta, { limit: 1000 });
        return (data ?? [])
          .filter((f) => f.id)
          .map((f) => ({
            caminho: `${pasta}/${f.name}`,
            criado: f.created_at ?? null,
            bytes: Number((f.metadata as { size?: number } | null)?.size ?? 0),
          }));
      }),
    );
    vistos.push(...listas.flat());
    lidas += lote.length;
  }
  const acabou = lidas === pastas.length;

  // Sem ler o balde todo não se sabe quanto ocupa: só a idade conta (tecto
  // infinito), como antes do tecto. Amanhã volta a tentar o resto.
  const sai = queSaiDaCache(vistos, agora, acabou ? TECTO_BYTES : Infinity);
  // O que nenhuma limpeza pode levar (`arquivo-de-pdfs/protegidos.ts`).
  const podem = semProtegidos(BUCKET_EDITORIAL, sai);
  const sairam = new Set<string>();
  for (let j = 0; j < podem.length; j += 100) {
    const lote = podem.slice(j, j + 100);
    const { error } = await balde.remove(lote);
    if (!error) for (const c of lote) sairam.add(c);
  }
  const bytesQueFicam = vistos.reduce((n, f) => n + (sairam.has(f.caminho) ? 0 : f.bytes), 0);
  return {
    apagadas: sairam.size,
    pastas: lidas,
    acabou,
    ...(acabou ? { bytesQueFicam } : {}),
  };
}
