import type { Locale } from "@/lib/i18n/config";

/**
 * Os assuntos de que a Líquen Events é autoridade (`knowsAbout` do JSON-LD,
 * 21/11): é o que as IAs e o Knowledge Graph do Google usam para ligar a marca
 * às pesquisas. Só o que a empresa faz, na língua da página. Ninguém os vê no
 * ecrã: vivem aqui, e não nos dicionários, que são o texto à vista.
 */
export const ASSUNTOS_DA_EMPRESA: Record<Locale, readonly string[]> = {
  pt: [
    "Decoração de casamentos",
    "Coordenação de casamentos",
    "Decoração de eventos",
    "Eventos corporativos",
    "Decoração floral",
    "Destination weddings em Portugal",
  ],
  en: [
    "Wedding decoration",
    "Wedding coordination",
    "Event decoration",
    "Corporate events",
    "Floral design",
    "Destination weddings in Portugal",
  ],
};
