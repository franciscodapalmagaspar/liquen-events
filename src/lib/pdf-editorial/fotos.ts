import "server-only";
import sharp from "sharp";
import type { Foco } from "./imagens";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS DA PROPOSTA, MEDIDAS — E QUEM VAI PARA QUE PÁGINA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O documento dela pede que as fotografias dos painéis, dos fundos e dos
 * separadores saiam das que ela já carregou: «dando preferência às de maior
 * resolução e de orientação horizontal, e sem repetir a mesma imagem em duas
 * páginas seguidas». O álbum é isso — sabe o tamanho e a forma de cada foto e
 * em que páginas já foi usada.
 */

export interface Foto {
  /** Identidade estável dentro do documento (a mesma foto em dois temas são duas). */
  id: number;
  bytes: Buffer;
  /** O que identifica a foto no relatório («Tema «Cocktail» · foto 3»). */
  origem: string;
  /** Pixéis, já com a rotação EXIF aplicada. */
  w: number;
  h: number;
  /** Largura ÷ altura. */
  aspecto: number;
  pixeis: number;
  /** O índice do tema de onde vem, ou `null` para as fotos de capa. */
  tema: number | null;
  /** O enquadramento escolhido à mão — ver `Foco` em `imagens.ts`. */
  foco?: Foco;
  /** O caminho no armazenamento, quando se sabe — o que a identifica no estúdio. */
  ref?: string;
}

/** Lê o tamanho do cabeçalho — sem descodificar a imagem. */
export async function medir(
  bytes: Buffer,
  origem: string,
  id: number,
  tema: number | null,
): Promise<Foto> {
  try {
    const m = await sharp(bytes, { failOn: "none" }).metadata();
    const deitada = (m.orientation ?? 1) >= 5;
    const w = (deitada ? m.height : m.width) ?? 1;
    const h = (deitada ? m.width : m.height) ?? 1;
    return { id, bytes, origem, w, h, aspecto: w / h, pixeis: w * h, tema };
  } catch {
    return { id, bytes, origem, w: 1, h: 1, aspecto: 1, pixeis: 0, tema };
  }
}

/** Uma foto com a medida já sabida (sem ler o cabeçalho). */
export function comMedida(
  bytes: Buffer,
  origem: string,
  id: number,
  tema: number | null,
  { w, h }: { w: number; h: number },
  ref?: string,
): Foto {
  const ok = w > 0 && h > 0;
  return {
    id,
    bytes,
    origem,
    w: ok ? w : 1,
    h: ok ? h : 1,
    aspecto: ok ? w / h : 1,
    pixeis: ok ? w * h : 0,
    tema,
    ...(ref ? { ref } : {}),
  };
}

/** A forma que um lugar pede. */
export type Forma = "alta" | "deitada" | "qualquer";

const serve = (f: Foto, forma: Forma) =>
  forma === "alta" ? f.aspecto < 0.95 : forma === "deitada" ? f.aspecto > 1.2 : true;

/**
 * Abaixo disto (lado maior, em pixéis do ficheiro), uma fotografia fica
 * esticada numa página inteira — o mesmo número da capa (`LADO_MINIMO_DA_CAPA`)
 * e da régua do aviso (`qualidade-da-foto.ts`). Ela (28/10): «não sei se o
 * sistema consegue ser inteligente o suficiente para perceber onde é que deve
 * colocar a foto relativamente à resolução».
 */
const LADO_QUE_CHEGA = 1200;

export class Album {
  private readonly usos = new Map<number, number[]>();

  constructor(readonly fotos: readonly Foto[]) {}

  /** Regista que `foto` aparece na página `pagina`. */
  usar(foto: Foto, pagina: number): void {
    const l = this.usos.get(foto.id) ?? [];
    l.push(pagina);
    this.usos.set(foto.id, l);
  }

  /** Quantas vezes já foi usada, e se está numa página vizinha de `pagina`. */
  private estado(f: Foto, pagina: number) {
    const l = this.usos.get(f.id) ?? [];
    return { vezes: l.length, vizinha: l.some((p) => Math.abs(p - pagina) <= 1) };
  }

  /**
   * As `quantas` melhores fotos para um lugar na página `pagina`.
   *
   * Por ordem: nunca numa página vizinha; fora das que quem chama quer evitar;
   * da forma pedida (uma foto deitada num painel alto perde dois terços);
   * com pixéis que cheguem (28/10: uma pequena por usar já não ganha a uma
   * grande que já apareceu); ainda não usada; e, entre essas, a de mais pixéis.
   * Se não chegarem as que cumprem tudo, larga-se primeiro a forma, depois a
   * vizinhança — uma página com fotografia repetida é melhor do que sem
   * fotografia. As escolhidas ficam registadas nessa página.
   */
  escolher(
    pagina: number,
    forma: Forma,
    quantas = 1,
    de: readonly Foto[] = this.fotos,
    evitar: ReadonlySet<number> = new Set(),
  ): Foto[] {
    // Comparação por degraus, do mais forte para o mais fraco.
    const nota = (f: Foto) => {
      const e = this.estado(f, pagina);
      return [
        e.vizinha ? 0 : 1,
        evitar.has(f.id) ? 0 : 1,
        serve(f, forma) ? 1 : 0,
        Math.max(f.w, f.h) >= LADO_QUE_CHEGA ? 1 : 0,
        e.vezes === 0 ? 1 : 0,
        f.pixeis,
      ];
    };
    const compara = (a: Foto, b: Foto) => {
      const [x, y] = [nota(a), nota(b)];
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
      return a.id - b.id;
    };
    const boas = de.filter((f) => f.pixeis > 0);
    const escolhidas = [...boas].sort(compara).slice(0, quantas);
    for (const f of escolhidas) this.usar(f, pagina);
    return escolhidas;
  }
}
