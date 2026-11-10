import "server-only";
import { getSupabase } from "@/lib/supabase";
import { BUCKET_EDITORIAL } from "@/lib/fotos-editoriais-guardadas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOS TRATADAS VELHAS SAEM (10/11, decisão dela)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: «eu não quero pagar nada» — o Supabase fica no plano gratuito (1 GB de
 * ficheiros), e a 10/11 ia em 928 MB. O balde `fotos-editoriais` é uma CACHE:
 * a fotografia reduzida e a «preparada» para a página do PDF, que se refazem
 * sozinhas se faltarem (`fotos-editoriais-guardadas.ts`,
 * `preparadas-guardadas.ts`). Encheu 158 MB numa semana.
 *
 * Todas as noites, na tarefa que já corre (`cron/backup`), sai o que tem mais
 * de {@link DIAS} dias. Pela IDADE e não pelo último uso: o Supabase não
 * regista as leituras (medido: `last_accessed_at` fica sempre igual à
 * criação). O que ainda estiver em uso refaz-se uma vez — um desenho a mais
 * por mês por proposta activa, fracções de cêntimo — e volta a ficar 30 dias.
 *
 * As fotografias ORIGINAIS (`proposal-assets`, `theme-assets`) nunca passam
 * por aqui. Nada disto lança: se falhar, amanhã tenta outra vez.
 */
export const DIAS = 30;

/** Quantas pastas se lêem ao mesmo tempo (são 256, de duas letras). */
const EM_PARALELO = 16;

export async function limparFotosTratadasVelhas(
  agora: Date,
  prazoMs = 15_000,
): Promise<{ apagadas: number; pastas: number; acabou: boolean }> {
  const sb = getSupabase();
  if (!sb) return { apagadas: 0, pastas: 0, acabou: true };
  const fim = Date.now() + prazoMs;
  const limite = agora.getTime() - DIAS * 24 * 60 * 60_000;
  const balde = sb.storage.from(BUCKET_EDITORIAL);

  const { data: raiz } = await balde.list("", { limit: 1000 });
  const pastas = (raiz ?? []).filter((e) => !e.id).map((e) => e.name);
  let apagadas = 0;
  let vistas = 0;

  for (let i = 0; i < pastas.length; i += EM_PARALELO) {
    if (Date.now() > fim) return { apagadas, pastas: vistas, acabou: false };
    const lote = pastas.slice(i, i + EM_PARALELO);
    const velhas = (
      await Promise.all(
        lote.map(async (pasta) => {
          const { data } = await balde.list(pasta, { limit: 1000 });
          return (data ?? [])
            .filter((f) => f.id && f.created_at && Date.parse(f.created_at) < limite)
            .map((f) => `${pasta}/${f.name}`);
        }),
      )
    ).flat();
    vistas += lote.length;
    for (let j = 0; j < velhas.length; j += 100) {
      const { error } = await balde.remove(velhas.slice(j, j + 100));
      if (!error) apagadas += Math.min(100, velhas.length - j);
    }
  }
  return { apagadas, pastas: vistas, acabou: true };
}
