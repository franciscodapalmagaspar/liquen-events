/**
 * ════════════════════════════════════════════════════════════════════════════
 * IMPORTAR: QUAIS DESTAS FOTOGRAFIAS JÁ ESTÃO GUARDADAS — PELOS BYTES OU PELO
 * QUE MOSTRAM (13/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A resposta de `/api/orcamento/fotos-existentes` traz duas coisas por foto:
 * `existentes` (o mesmo ficheiro, pelo resumo exacto) e `parecidas` (a mesma
 * fotografia noutro ficheiro, pela impressão visual — `impressao-visual.ts`).
 * Aqui decide-se, sem rede e sem ecrã (puro — testado):
 *
 *  · resumo igual, ou impressão «mesma» (quase certo) → usa-se a guardada,
 *    automaticamente: «já existe — não ocupa espaço»;
 *  · impressão «talvez» → NINGUÉM decide sozinho. Fica em `duvidas`, e o ecrã
 *    mostra as duas lado a lado com «É a mesma» / «É outra». Enquanto ela não
 *    disser «É a mesma», a foto conta como NOVA (sobe e ocupa espaço) — nunca
 *    se troca uma fotografia por outra sem ela confirmar.
 */

export interface ParecidaRespondida {
  /** Onde a fotografia já está guardada (`tema:<…>` ou `<pedido>/<x>.jpg`). */
  caminho: string;
  veredicto: "mesma" | "talvez";
  /** A miniatura assinada da guardada, para comparar. */
  miniatura: string | null;
}

export interface RespostaDasGuardadas {
  /** resumo → caminho guardado. */
  existentes: Record<string, unknown>;
  /** impressão → a parecida. */
  parecidas: Record<string, unknown>;
}

export interface FotoAPerguntar {
  /** O caminho da foto dentro do ficheiro importado. */
  caminho: string;
  resumo?: string | null;
  impressao?: string | null;
  /**
   * O lado de que esta foto precisa: o lado maior dela, até ao que se
   * guardaria (1 800 num mood board, 2 200 na capa). Uma guardada mais
   * pequena nunca a substitui — sobe a nova.
   */
  lado?: number | null;
}

export interface Duvida {
  /** A guardada que se parece com esta. */
  caminho: string;
  miniatura: string | null;
}

function parecidaValida(v: unknown): ParecidaRespondida | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (typeof p.caminho !== "string" || !p.caminho) return null;
  if (p.veredicto !== "mesma" && p.veredicto !== "talvez") return null;
  return {
    caminho: p.caminho,
    veredicto: p.veredicto,
    miniatura: typeof p.miniatura === "string" && p.miniatura ? p.miniatura : null,
  };
}

/** O que a resposta diz de UMA foto: a guardada exacta, ou a parecida, ou nada. */
export function respostaDaFoto(
  f: FotoAPerguntar,
  r: RespostaDasGuardadas,
): { exacta: string | null; parecida: ParecidaRespondida | null } {
  const e = f.resumo ? r.existentes[f.resumo] : undefined;
  const exacta = typeof e === "string" && e ? e : null;
  const parecida = f.impressao ? parecidaValida(r.parecidas[f.impressao]) : null;
  return { exacta, parecida };
}

/**
 * Separa as fotos em: as que já estão guardadas (usam-se sem perguntar) e as
 * da zona cinzenta (perguntam-se). As restantes são novas.
 */
export function classificarGuardadas(
  fotos: readonly FotoAPerguntar[],
  r: RespostaDasGuardadas,
): { existentes: Map<string, string>; duvidas: Map<string, Duvida> } {
  const existentes = new Map<string, string>();
  const duvidas = new Map<string, Duvida>();
  for (const f of fotos) {
    const { exacta, parecida } = respostaDaFoto(f, r);
    if (exacta) existentes.set(f.caminho, exacta);
    else if (parecida?.veredicto === "mesma") existentes.set(f.caminho, parecida.caminho);
    else if (parecida?.veredicto === "talvez")
      duvidas.set(f.caminho, { caminho: parecida.caminho, miniatura: parecida.miniatura });
  }
  return { existentes, duvidas };
}

export type Decisao = "mesma" | "outra";

/**
 * As guardadas que contam, com as decisões dela: uma dúvida só entra quando
 * ela disse «É a mesma». Sem decisão — ou com «É outra» — é nova.
 */
export function guardadasComDecisoes(
  existentes: ReadonlyMap<string, string>,
  duvidas: ReadonlyMap<string, Duvida>,
  decisoes: ReadonlyMap<string, Decisao>,
): Map<string, string> {
  const out = new Map(existentes);
  for (const [caminho, d] of duvidas)
    if (decisoes.get(caminho) === "mesma") out.set(caminho, d.caminho);
  return out;
}

/** As dúvidas por responder (o ecrã pede-as em destaque). */
export function porResponder(
  duvidas: ReadonlyMap<string, Duvida>,
  decisoes: ReadonlyMap<string, Decisao>,
): string[] {
  return [...duvidas.keys()].filter((c) => !decisoes.has(c));
}

/**
 * Na reconfirmação antes de gravar o rascunho: a guardada que se escolheu
 * continua viva? Sim quando a resposta nova a devolve outra vez — pelo resumo
 * ou pela impressão, com qualquer veredicto (a decisão já foi tomada).
 */
export function continuaGuardada(
  escolhida: string,
  f: FotoAPerguntar,
  r: RespostaDasGuardadas,
): boolean {
  const { exacta, parecida } = respostaDaFoto(f, r);
  return exacta === escolhida || parecida?.caminho === escolhida;
}
