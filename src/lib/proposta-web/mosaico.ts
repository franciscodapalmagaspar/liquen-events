/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MOSAICO DE CADA CAPÍTULO NA PROPOSTA ONLINE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O protótipo dela (23/10): uma grelha de ponta a ponta, 4 colunas no
 * computador e 2 no telemóvel, 4 px de intervalo, `grid-auto-flow: dense`. Uma
 * fotografia ao alto ocupa duas linhas (uma sim, outra não — senão vira uma
 * parede de colunas), uma deitada ocupa duas colunas, e há UMA célula de texto
 * por capítulo, em terceiro lugar como no protótipo.
 *
 * A regra do LEIA-ME: «garantir que a soma de células preenche linhas
 * completas de 4 — se faltar, alargar a última foto ou a célula de texto».
 * Somar unidades não chega (uma alta ao lado de uma larga deixa um buraco que
 * nenhuma conta vê), por isso simula-se a grelha. E não há formas que sirvam
 * as 4 colunas e as 2 ao mesmo tempo em todos os casos: cada largura tem a
 * sua disposição (`forma` e `formaMovel`), cada uma sem buracos.
 */

/** «grande» (2×2) só aparece no acerto final, quando nada mais fecha a linha. */
export type FormaDaCelula = "normal" | "alta" | "larga" | "grande";

export interface CelulaDoMosaico {
  tipo: "foto" | "texto";
  /** A posição da fotografia na lista dada (só nas fotografias). */
  indice?: number;
  /** A forma no computador (4 colunas). */
  forma: FormaDaCelula;
  /** A forma no telemóvel (2 colunas) — calculada à parte, sem buracos. */
  formaMovel: FormaDaCelula;
}

/** Abaixo disto, ao alto; acima de `DEITADA`, deitada. */
const AO_ALTO = 0.85;
const DEITADA = 1.3;
/** A célula de texto entra depois de duas fotografias, como no protótipo. */
const LUGAR_DO_TEXTO = 2;

type Celula = { tipo: "foto" | "texto"; indice?: number; forma: FormaDaCelula };

const unidades = (c: { forma: FormaDaCelula }) =>
  c.forma === "normal" ? 1 : c.forma === "grande" ? 4 : 2;

export function mosaicoDoCapitulo(aspectos: readonly number[], comTexto = true): CelulaDoMosaico[] {
  const quatro = arranjo(aspectos, comTexto, 4);
  const duas = arranjo(aspectos, comTexto, 2);
  return quatro.map((c, i) => ({ ...c, formaMovel: duas[i].forma }));
}

/**
 * As formas para uma grelha de `cols` colunas, sem buracos: simula-se a
 * grelha (`grid-auto-flow: dense`, como o CSS) e, enquanto houver buracos, a
 * última alta passa a normal, depois a última larga. No fim, a última linha
 * completa-se fazendo crescer a célula que o aguente sem abrir buracos.
 */
function arranjo(aspectos: readonly number[], comTexto: boolean, cols: number): Celula[] {
  let altas = 0;
  const celulas: Celula[] = aspectos.map((a, indice) => {
    if (a < AO_ALTO) return { tipo: "foto", indice, forma: altas++ % 2 === 0 ? "alta" : "normal" };
    if (a > DEITADA) return { tipo: "foto", indice, forma: "larga" };
    return { tipo: "foto", indice, forma: "normal" };
  });
  if (comTexto) {
    celulas.splice(Math.min(LUGAR_DO_TEXTO, celulas.length), 0, { tipo: "texto", forma: "normal" });
  }
  if (!celulas.length) return celulas;

  const semBuracos = () => buracos(celulas, cols) === 0;
  for (let n = 0; n < celulas.length * 2 && !semBuracos(); n++) {
    const i = ultimo(celulas, "alta") ?? ultimo(celulas, "larga");
    if (i === null) break;
    celulas[i] = { ...celulas[i], forma: "normal" };
  }
  for (let melhorou = true; melhorou && falta(celulas, cols) > 0; ) {
    melhorou = false;
    for (let i = celulas.length - 1; i >= 0 && falta(celulas, cols) > 0; i--) {
      const antes = celulas[i];
      const aoAlto = antes.indice !== undefined && aspectos[antes.indice] < AO_ALTO;
      const crescer: FormaDaCelula[] =
        antes.forma === "normal"
          ? aoAlto
            ? ["alta", "larga"]
            : ["larga", "alta"]
          : antes.forma === "grande"
            ? []
            : cols > 2
              ? ["grande"]
              : [];
      for (const forma of crescer) {
        const faltava = falta(celulas, cols);
        celulas[i] = { ...antes, forma };
        if (semBuracos() && falta(celulas, cols) < faltava) {
          melhorou = true;
          break;
        }
        celulas[i] = antes;
      }
    }
  }
  return celulas;
}

function ultimo(celulas: readonly Celula[], forma: FormaDaCelula): number | null {
  for (let i = celulas.length - 1; i >= 0; i--) if (celulas[i].forma === forma) return i;
  return null;
}

/** Onde cada célula cai numa grelha densa de `cols` colunas (o algoritmo do CSS). */
function grelha(celulas: readonly { forma: FormaDaCelula }[], cols: number): boolean[][] {
  const ocupado: boolean[][] = [];
  const livre = (r: number, c: number) => !ocupado[r]?.[c];
  const marcar = (r: number, c: number) => {
    while (ocupado.length <= r) ocupado.push(Array(cols).fill(false));
    ocupado[r][c] = true;
  };
  for (const cel of celulas) {
    const w = cel.forma === "larga" || cel.forma === "grande" ? Math.min(2, cols) : 1;
    const h = cel.forma === "alta" || cel.forma === "grande" ? 2 : 1;
    for (let r = 0, posta = false; !posta; r++) {
      for (let c = 0; c + w <= cols && !posta; c++) {
        let cabe = true;
        for (let dr = 0; dr < h && cabe; dr++)
          for (let dc = 0; dc < w && cabe; dc++) cabe = livre(r + dr, c + dc);
        if (!cabe) continue;
        for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) marcar(r + dr, c + dc);
        posta = true;
      }
    }
  }
  return ocupado;
}

/** Os buracos ACIMA da última linha (o que sobra na última conta-se à parte). */
export function buracos(celulas: readonly { forma: FormaDaCelula }[], cols: number): number {
  const g = grelha(celulas, cols);
  return g.slice(0, -1).reduce((s, linha) => s + linha.filter((x) => !x).length, 0);
}

/** As células vazias na última linha. */
export function falta(celulas: readonly { forma: FormaDaCelula }[], cols: number): number {
  const g = grelha(celulas, cols);
  return g.length ? g[g.length - 1].filter((x) => !x).length : 0;
}

/** As unidades que um mosaico ocupa (para os testes e para quem desenha). */
export const unidadesDoMosaico = (celulas: readonly { forma: FormaDaCelula }[]) =>
  celulas.reduce((s, c) => s + unidades(c), 0);
