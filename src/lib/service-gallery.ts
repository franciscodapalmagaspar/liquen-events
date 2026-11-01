import { PHOTOS, type Label } from "@/app/[lang]/(site)/galeria/photos-data";
import dims from "./image-dims.json";

/**
 * FOTOS DIFERENTES A CADA VISITA, MAS SEMPRE DO SERVIÇO CERTO.
 *
 * A secção "Momentos que criámos" mostrava seis fotos fixas, escritas à mão em
 * `services-data.ts`. Quem voltasse à página via sempre as mesmas seis, e o
 * portefólio parecia mais pequeno do que é: só a etiqueta "Casamento" tem 333
 * fotografias.
 *
 * Aqui as seis são tiradas ao acaso do conjunto que corresponde ÀQUELA página,
 * usando as etiquetas que a galeria já mantém. Não há uma segunda lista para
 * manter em dia: acrescentar uma foto à galeria põe-na automaticamente a
 * circular na página de serviço certa.
 */

/** Etiquetas da galeria que servem cada página de serviço. */
const POOLS: Record<string, Label[]> = {
  casamentos: ["Casamento"],
  "eventos-corporativos": ["Corporativo", "Conferência"],
  "festas-e-aniversarios": ["Evento"],
  "batizados-e-comunhoes": ["Evento"],
  // `aluguer-de-viaturas-classicas` não está aqui de propósito: não existe
  // etiqueta para as viaturas, e sortear do conjunto dos casamentos encheria a
  // página de mesas postas sem um único carro. Fica com a lista escolhida à mão
  // até haver fotos etiquetadas.
};

/** Quantas fotos a secção mostra (a grelha tem seis posições). */
export const SERVICE_GALLERY_SIZE = 6;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SÓ FOTOGRAFIAS DEITADAS — E PORQUÊ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A queixa, textual: "aqui coloca fotos que se adequem em termos de posição
 * para se ver bem as fotos".
 *
 * A causa é aritmética. Os mosaicos desta secção são MUITO deitados: num ecrã
 * de 1440 px a grelha é de seis colunas com filas de 340 px, portanto o
 * mosaico grande mede 960 x 340 — proporção 2,8:1 — e o do meio 720 x 340.
 * Das 333 fotografias com a etiqueta "Casamento", 254 são VERTICAIS. Um
 * sorteio ao acaso põe três em cada quatro numa moldura três vezes mais larga
 * do que alta, e o `object-cover` faz o que tem a fazer: amplia até encher e
 * corta o resto. O que sobra é uma tira do meio da fotografia — foi o que ela
 * fotografou.
 *
 * MEDIDO, por conjunto: casamentos 79 deitadas em 333; corporativos 23 em 35;
 * eventos 14 em 52. Todos têm mais do que as seis de que a grelha precisa,
 * portanto filtrar não empobrece a rotação ao ponto de se notar.
 *
 * O limiar é 1,4 e não 1,0: uma fotografia quadrada num mosaico de 2,8:1
 * perde metade da altura, o que ainda é um corte mau. (No conjunto real não
 * há nenhuma entre 1,0 e 1,4 — os dois valores dariam hoje o mesmo resultado.
 * Fica 1,4 porque é o que descreve a moldura, e é o que continua certo no dia
 * em que entrarem fotografias quadradas.)
 */
const PROPORCAO_MINIMA = 1.4;

/**
 * Largura mínima do ficheiro de origem.
 *
 * O mosaico grande é servido a 67vw: num portátil de 1440 px com ecrã de
 * densidade dupla são quase 2000 px de largura real. Abaixo disso o browser
 * amplia, e uma fotografia ampliada numa secção de portefólio é a única coisa
 * pior do que uma fotografia mal cortada.
 *
 * É uma PREFERÊNCIA, não uma exigência: se o conjunto ficar pequeno de mais
 * para encher a grelha, o filtro cai. Uma grelha com buracos seria pior.
 */
const LARGURA_MINIMA = 2000;

const DIMENSOES = dims as Record<string, number[]>;

/** Deitada que chegue para o mosaico, e grande que chegue para o ecrã. */
function serve(src: string, larguraMinima: number): boolean {
  const d = DIMENSOES[src];
  // Sem dimensões conhecidas não há como julgar, e adivinhar é pior: fica de
  // fora. Hoje o mapa cobre as 428 fotografias da galeria.
  if (!d) return false;
  const [largura, altura] = d;
  return largura / altura >= PROPORCAO_MINIMA && largura >= larguraMinima;
}

/**
 * `n` fotos ao acaso do conjunto deste serviço, sem repetições.
 *
 * Devolve `null` quando o serviço não tem conjunto próprio ou quando o conjunto
 * é pequeno de mais para encher a grelha — nesse caso quem chama fica com a
 * lista escolhida à mão, que é melhor do que uma grelha com buracos.
 */
export function pickServiceGallery(slug: string, n = SERVICE_GALLERY_SIZE): string[] | null {
  const pool = conjuntoDoServico(slug, n);
  if (!pool || pool.length < n) return null;
  return baralhar(pool, n);
}

/**
 * QUANTAS FOTOGRAFIAS ANDAM A RODAR NA GRELHA (1/11).
 *
 * Ela: «temos que alternar as fotos aqui», e, posta a escolha, «irem trocando
 * sozinhas». A grelha continua com seis posições, mas recebe até 18: as seis
 * que se vêem ao abrir e as que vão entrando uma de cada vez. São também as que
 * a lupa percorre quando se toca numa («quero que as pessoas, se quiserem ver
 * essas fotos, consigam carregar»).
 */
export const SERVICE_GALLERY_ROTATION = 18;

/**
 * Até `max` fotografias do serviço, ao acaso e sem repetições, todas do MESMO
 * degrau da escada de `conjuntoDoServico` — as que servem a moldura. Num
 * conjunto com menos de `max` deitadas (os eventos têm 14) vêm só essas: rodar
 * entre 14 boas é melhor do que meter verticais na grelha para chegar às 18.
 */
export function pickServiceGalleryPool(
  slug: string,
  max = SERVICE_GALLERY_ROTATION,
): string[] | null {
  const pool = conjuntoDoServico(slug, SERVICE_GALLERY_SIZE);
  if (!pool || pool.length < SERVICE_GALLERY_SIZE) return null;
  return baralhar(pool, Math.min(max, pool.length));
}

/**
 * O conjunto mais exigente que ainda enche `n` posições: deitada e grande,
 * depois só deitada, e por fim todas. Cada degrau só se desce quando o de cima
 * não enche a grelha, portanto na prática nenhum serviço desce nenhum — mas o
 * dia em que alguém acrescentar um serviço com poucas fotografias não parte a
 * página.
 */
function conjuntoDoServico(slug: string, n: number): string[] | null {
  const labels = POOLS[slug];
  if (!labels) return null;
  const todas = PHOTOS.filter((p) => labels.includes(p.label)).map((p) => p.src);
  return (
    [todas.filter((s) => serve(s, LARGURA_MINIMA)), todas.filter((s) => serve(s, 0)), todas].find(
      (c) => c.length >= n,
    ) ?? []
  );
}

/**
 * Fisher-Yates parcial: baralha só as `n` primeiras posições, que é tudo o
 * que se lê. Numa lista de 333 evita baralhar 333 para usar 6.
 */
function baralhar(pool: string[], n: number): string[] {
  const copy = pool.slice();
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
