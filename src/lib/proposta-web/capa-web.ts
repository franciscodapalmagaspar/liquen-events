import "server-only";
import { signCapasWebAvif, signProposalMidsAvif } from "@/lib/proposal-assinaturas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CAPA DA PROPOSTA ONLINE, EM AVIF
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (27/10): «sim, avança com a capa em AVIF», e escolheu «Mais rápida» —
 * no telemóvel os mesmos pixéis de hoje em metade do peso, e no computador uma
 * versão maior, para a capa não ficar esbatida no ecrã grande.
 *
 * As duas são fabricadas UMA vez por fotografia (`fabricarCapaWebEmAvif`) e
 * ficam guardadas. Isto só corre quando a página é montada — no envio, ou
 * quando o retrato falta (`retrato.ts`) —, nunca numa visita normal, que lê o
 * retrato já com os endereços lá dentro.
 *
 * Sem elas (armazenamento em baixo, tecto passado), a capa fica como estava:
 * o `<picture>` só oferece o que existe.
 */

export interface CapaWeb {
  /** A AVIF de 1200 — a que o telemóvel recebe. */
  avif?: string;
  /** A AVIF grande (lado maior até 2000) — a do ecrã largo. */
  grande?: string;
}

/**
 * O mais que a montagem espera pela fabricação; a seguir segue sem ela. Curto
 * de propósito: numa proposta antiga isto acontece na 1.ª visita depois de
 * publicar, com o casal à espera. A fabricação não é cancelada — acaba sozinha,
 * e a próxima montagem já a encontra.
 */
const TECTO_MS = 4000;

export async function capaWebEmAvif(ref: string, avifJaAssinada?: string): Promise<CapaWeb> {
  if (!ref || ref.startsWith("data:") || /^https?:\/\//i.test(ref)) {
    return avifJaAssinada ? { avif: avifJaAssinada } : {};
  }

  const assinar = async (): Promise<CapaWeb> => {
    const [grandes, medias] = await Promise.all([
      signCapasWebAvif([ref]),
      avifJaAssinada ? Promise.resolve(new Map<string, string>()) : signProposalMidsAvif([ref]),
    ]);
    const avif = avifJaAssinada ?? medias.get(ref);
    const grande = grandes.get(ref);
    return { ...(avif ? { avif } : {}), ...(grande ? { grande } : {}) };
  };

  const semNada: CapaWeb = avifJaAssinada ? { avif: avifJaAssinada } : {};
  let capa = await assinar().catch(() => semNada);
  if (capa.avif && capa.grande) return capa;

  const { fabricarCapaWebEmAvif } = await import("@/lib/derivadas");
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const feitas = await Promise.race([
    fabricarCapaWebEmAvif(ref, { media: !capa.avif, grande: !capa.grande }).catch(() => 0),
    new Promise<number>((r) => {
      relogio = setTimeout(() => r(0), TECTO_MS);
    }),
  ]);
  clearTimeout(relogio);
  if (feitas > 0) capa = await assinar().catch(() => capa);
  return capa;
}
