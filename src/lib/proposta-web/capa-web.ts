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
 * ── A PÁGINA NÃO ESPERA PELA FABRICAÇÃO (28/10) ──────────────────────────
 *
 * A 1.ª versão esperava até 4 s e seguia sem ela. Medido depois de publicada:
 * codificar a de 1200 leva ~4,5 s e a grande ~9 s — perdia SEMPRE, e numa
 * função do servidor o que fica a correr depois da resposta é cortado. Nenhuma
 * AVIF chegou a ficar guardada. Agora a montagem leva o que já existe (a capa
 * de sempre, se ainda não houver nada) e devolve a fabricação em `porFazer`:
 * quem monta (`retrato.ts`) segura-a com o `after()` e, quando acaba, volta a
 * montar a página — a visita seguinte já recebe a capa em AVIF.
 */

export interface CapaWeb {
  /** A AVIF de 1200 — a que o telemóvel recebe. */
  avif?: string;
  /** A AVIF grande (lado maior até 2000) — a do ecrã largo. */
  grande?: string;
}

export interface CapaWebAgora {
  /** O que já existe e está assinado — o que esta montagem leva. */
  capa: CapaWeb;
  /**
   * A fabricação do que falta, a correr: resolve com quantas ficaram feitas
   * (0 se nada se fez). Nunca rejeita.
   */
  porFazer?: Promise<number>;
}

export async function capaWebEmAvif(ref: string, avifJaAssinada?: string): Promise<CapaWebAgora> {
  const semNada: CapaWeb = avifJaAssinada ? { avif: avifJaAssinada } : {};
  if (!ref || ref.startsWith("data:") || /^https?:\/\//i.test(ref)) return { capa: semNada };

  const [grandes, medias] = await Promise.all([
    signCapasWebAvif([ref]),
    avifJaAssinada ? Promise.resolve(new Map<string, string>()) : signProposalMidsAvif([ref]),
  ]).catch(() => [new Map<string, string>(), new Map<string, string>()] as const);
  const avif = avifJaAssinada ?? medias.get(ref);
  const grande = grandes.get(ref);
  const capa: CapaWeb = { ...(avif ? { avif } : {}), ...(grande ? { grande } : {}) };
  if (capa.avif && capa.grande) return { capa };

  const porFazer = import("@/lib/derivadas")
    .then(({ fabricarCapaWebEmAvif }) =>
      fabricarCapaWebEmAvif(ref, { media: !capa.avif, grande: !capa.grande }),
    )
    .catch(() => 0);
  return { capa, porFazer };
}
