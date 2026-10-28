import { LARGURAS_DE_PARTILHA } from "./proposta-fotos-verificacao-tipos";
import { LADO_MINIMO_DA_CAPA, problemaDaCapa } from "./pdf-editorial/regra-da-capa";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESTA FOTOGRAFIA VAI FICAR BEM NESTE SÍTIO? — a pergunta, num sítio só
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (28/10): «quero que o sistema seja inteligente o suficiente para, quando
 * tentamos colocar uma foto, ele diga que aquela foto vai ficar com uma
 * qualidade péssima… e que avise mesmo». E escolheu «Avisa, não bloqueia»:
 * uma foto má abre o aviso com «Escolher outra» e «Usar na mesma»; nada
 * impede o envio.
 *
 * Puro, sem rede: o estúdio pergunta no instante em que a foto entra, e a
 * conferência antes do envio faz a MESMA pergunta — duas regras acabavam a
 * discordar, e o aviso a dizer «serve» com a página esticada era o pior caso.
 *
 * ── OS NÚMEROS, E DE ONDE VÊM ─────────────────────────────────────────────
 *
 * Página inteira (a capa e as páginas de uma foto só): o LADO MAIOR, porque
 * a fotografia cobre a folha. Abaixo de 1200 px (`LADO_MINIMO_DA_CAPA`, o
 * mesmo que o PDF usa para recusar a capa) o grão vê-se no papel; abaixo de
 * 1800 a capa de um ecrã de computador já é esticada.
 *
 * Mood boards: o LADO MENOR, porque a foto pode cair em qualquer célula do
 * mosaico — ao alto ou deitada — e numa célula grande do ecrã de computador
 * (~720 pontos, o dobro em pixéis) a largura que conta é a mais curta. Abaixo
 * de 800 vê-se desfocada; abaixo de 1100 só aguenta as células pequenas.
 * As medidas do Pinterest (236, 474, 564, 736) contam sempre como más: são o
 * ficheiro do site, não o original (`LARGURAS_DE_PARTILHA`).
 */

export type LugarDaFoto = "capa" | "pagina" | "tema";

export type NivelDaFoto = "boa" | "fraca" | "ma";

export interface AvaliacaoDaFoto {
  nivel: NivelDaFoto;
  /** Em palavras, para ela — `null` quando a foto é boa. */
  motivo: string | null;
}

const PAGINA = { ma: LADO_MINIMO_DA_CAPA, fraca: 1800 } as const;
const TEMA = { ma: 800, fraca: 1100 } as const;

const ONDE: Record<LugarDaFoto, string> = {
  capa: "a capa",
  pagina: "uma página inteira",
  tema: "um mood board",
};

/** Avalia uma fotografia com estas medidas (pixéis do ficheiro) para este sítio. */
export function avaliarFoto(w: number, h: number, lugar: LugarDaFoto): AvaliacaoDaFoto {
  if (!(w > 0) || !(h > 0)) return { nivel: "boa", motivo: null };
  const w0 = Math.round(w);
  const h0 = Math.round(h);
  const medidas = `${w0} × ${h0} px`;

  if (LARGURAS_DE_PARTILHA.includes(w0)) {
    return {
      nivel: "ma",
      motivo: `Tem ${medidas}, a medida com que o Pinterest serve as imagens: é a cópia do site, não o original. Vai parecer desfocada.`,
    };
  }

  if (lugar === "tema") {
    const curto = Math.min(w0, h0);
    if (curto < TEMA.ma)
      return {
        nivel: "ma",
        motivo: `É pequena (${medidas}). Num mood board vai parecer desfocada — pede pelo menos ${TEMA.ma} px no lado mais curto.`,
      };
    if (curto < TEMA.fraca)
      return {
        nivel: "fraca",
        motivo: `É um pouco pequena (${medidas}): fica bem nas células pequenas, mas não numa grande.`,
      };
    return { nivel: "boa", motivo: null };
  }

  const longo = Math.max(w0, h0);
  if (longo < PAGINA.ma)
    return {
      nivel: "ma",
      motivo: `É pequena para ${ONDE[lugar]} (${medidas}; pede pelo menos ${PAGINA.ma} px). Vai ficar desfocada.`,
    };
  if (lugar === "capa" && problemaDaCapa(w0, h0) === "ao-alto")
    return {
      nivel: "fraca",
      motivo: `É ao alto e a capa é deitada: perde mais de metade da foto no recorte.`,
    };
  if (longo < PAGINA.fraca)
    return {
      nivel: "fraca",
      motivo: `Serve para ${ONDE[lugar]}, mas num ecrã grande fica um pouco suave (${medidas}).`,
    };
  return { nivel: "boa", motivo: null };
}

/** O sítio de cada carregamento do estúdio, pela chave (`cover-…`, `board-…`, `pagina-…`). */
export function lugarDaChave(chave: string): LugarDaFoto {
  if (chave.startsWith("board-")) return "tema";
  if (chave.startsWith("pagina-")) return "pagina";
  return "capa";
}
