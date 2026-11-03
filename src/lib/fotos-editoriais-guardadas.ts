import "server-only";
import { createHash } from "node:crypto";
import { getSupabase } from "@/lib/supabase";
import { garantirBucketDeDerivadas } from "@/lib/theme-storage";
import { opcoesDeCarregamento } from "@/lib/cache-das-fotos";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FOTOGRAFIA DO PDF, JÁ REDUZIDA, GUARDADA FORA DA MEMÓRIA (3/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O desenho do PDF reduz cada fotografia a 1 800 px com o `sharp`
 * (`proposal-doc-render.ts`, `fotoEditorial`). Essa versão reduzida ficava só
 * na MEMÓRIA da função — e numa função da Vercel a memória dura o que dura a
 * instância. Cada instância nova (de manhã, depois de uma pausa, num pico)
 * voltava a descarregar os originais de 2–3 MB e a reduzi-los um a um: numa
 * proposta de quarenta fotografias, segundos de processador antes do
 * primeiro traço — e acontecia a cada página real do estúdio, a cada PDF.
 *
 * A 2/11 a conta passou o limite de processador da Vercel e o site foi
 * desligado. Isto é um dos sítios onde o processador ia: trabalho repetido
 * para chegar aos mesmos bytes.
 *
 * Agora a versão reduzida fica também no armazenamento. A próxima instância
 * DESCARREGA-a (espera de rede, que a Vercel não cobra como processador) em
 * vez de a refazer. Os bytes são exactamente os que o `sharp` produziu da
 * primeira vez, portanto o PDF sai igual.
 *
 * A chave é o resumo do caminho da fotografia mais a receita da redução. O
 * caminho de uma fotografia nesta casa nunca muda de conteúdo (trocar uma
 * foto grava um caminho novo — `cache-das-fotos.ts`); a receita entra na
 * chave para que mudar o tamanho ou a qualidade nunca sirva uma versão velha.
 */
export const BUCKET_EDITORIAL = "fotos-editoriais";

export function chaveEditorial(ref: string, receita: string): string {
  const resumo = createHash("sha256").update(`${receita}\u0000${ref}`).digest("hex");
  // Duas letras de pasta para não ter dezenas de milhares de ficheiros numa só.
  return `${resumo.slice(0, 2)}/${resumo}.jpg`;
}

/** A versão reduzida guardada, ou `null` (não há, ou o armazenamento falhou). */
export async function lerFotoEditorialGuardada(
  ref: string,
  receita: string,
): Promise<Buffer | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.storage.from(BUCKET_EDITORIAL).download(chaveEditorial(ref, receita));
    return data ? Buffer.from(await data.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/**
 * Guarda a versão reduzida. Nunca lança: se não ficar guardada, a próxima
 * instância reduz outra vez, que é o comportamento de antes.
 */
export async function guardarFotoEditorial(
  ref: string,
  receita: string,
  bytes: Buffer,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    if (!(await garantirBucketDeDerivadas(BUCKET_EDITORIAL))) return;
    const { error } = await sb.storage
      .from(BUCKET_EDITORIAL)
      .upload(chaveEditorial(ref, receita), bytes, opcoesDeCarregamento("image/jpeg", true));
    if (error) log.warn("fotos-editoriais: não ficou guardada", { erro: error.message });
  } catch (e) {
    log.warn("fotos-editoriais: não ficou guardada", { erro: String(e) });
  }
}
