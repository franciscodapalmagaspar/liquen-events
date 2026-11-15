/**
 * A CONSULTA da biblioteca — pura, sem base de dados e sem Storage.
 *
 * Recebe as fotos, as ligações às etiquetas e o que se procura, e devolve os
 * caminhos que respondem. Fica à parte da rota por uma razão prática: é aqui
 * que mora a semântica que a Catarina aprovou ("e" quer dizer "e"), e uma regra
 * que decide o que ela vê tem de poder ser testada sem levantar um servidor.
 *
 * Client-safe de propósito — a mesma função serve para filtrar no ecrã sem ir
 * ao servidor a cada tecla.
 */

import type { Eixo, FotoEtiqueta } from "./biblioteca-types";

export interface Procura {
  /** Etiquetas exigidas. TODAS têm de estar na foto (E entre elas). */
  etiquetas?: readonly string[];
  /** Eixos em que a foto NÃO pode ter nenhuma etiqueta — é como se pede
   *  "mostra-me o que falta etiquetar". */
  semEixo?: readonly Eixo[];
  /** Só fotos cuja etiqueta veio da migração (o "por confirmar" da revisão). */
  porConfirmar?: boolean;
  /** Só fotos desta pasta de origem. */
  pasta?: string;
}

/** `caminho → conjunto de etiquetas`, a partir das ligações. */
export function porFoto(ligacoes: readonly FotoEtiqueta[]): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  for (const l of ligacoes) {
    let s = mapa.get(l.path);
    if (!s) mapa.set(l.path, (s = new Set()));
    s.add(l.etiquetaId);
  }
  return mapa;
}

/**
 * A forma do nome de um pedido (`LIQ-…`, ver `quotes-store.ts`) — a mesma que
 * o `limpar-pastas-orfas.ts` usa para reconhecer a pasta de um pedido.
 */
const PASTA_DE_PEDIDO = /^LIQ-[A-Za-z0-9-]+$/;

/**
 * Esta linha da `biblioteca_fotos` é uma foto da BIBLIOTECA (de um tema)?
 *
 * A tabela guarda também as fotos das PROPOSTAS (`<pedido>/<uuid>.jpg`): o
 * carregamento do estúdio (`api/orcamento/[id]/assets`) grava lá a cor, o LQIP
 * e a forma de cada uma, e quem as lê são a grelha do estúdio, a página do
 * casal, a verificação pré-envio e o desenho do PDF (`formasDeCaminhosOuErro`).
 * Por isso essas linhas FICAM — mas não são fotos da Biblioteca: contá-las
 * inflacionava o total, e assiná-las no bucket dos temas falhava, o que
 * deixava buracos nas páginas. Um tema nunca tem pasta com esta forma (o id é
 * um UUID, ver `newThemeId`).
 */
export function ehFotoDaBiblioteca(path: string): boolean {
  const corte = path.indexOf("/");
  const pasta = corte < 0 ? path : path.slice(0, corte);
  return pasta !== "" && !PASTA_DE_PEDIDO.test(pasta);
}

/** Os caminhos cuja etiqueta ainda está por confirmar (veio da migração). */
export function porConfirmarSet(ligacoes: readonly FotoEtiqueta[]): Set<string> {
  const s = new Set<string>();
  for (const l of ligacoes) if (l.origem === "migracao") s.add(l.path);
  return s;
}

/**
 * O eixo a que uma etiqueta pertence, lido do próprio id (`<eixo>:<slug>`).
 *
 * Um id sem dois-pontos não pertence a eixo nenhum e devolve "" — e não os
 * caracteres todos menos o último, que é o que um `slice(0, -1)` distraído dá.
 * Um "solt" a fingir de eixo nunca casaria com "tipo", mas casaria com um eixo
 * futuro cujo nome acabasse igual, e o filtro "sem tipo" passaria a mentir.
 */
export function eixoDe(etiquetaId: string): string {
  const corte = etiquetaId.indexOf(":");
  return corte < 0 ? "" : etiquetaId.slice(0, corte);
}

/**
 * Esta foto responde à procura?
 *
 * "E" entre tudo: as etiquetas exigidas têm de estar TODAS lá, e os eixos
 * pedidos em falta têm de estar TODOS vazios. É a mesma leitura das regras dos
 * temas, e é o que faz "seating plan terracotta" devolver seating plans em
 * terracotta — e não tudo o que seja uma coisa OU outra.
 */
export function responde(
  etiquetasDaFoto: ReadonlySet<string> | undefined,
  procura: Procura,
  porConfirmar = false,
): boolean {
  const tem = etiquetasDaFoto ?? new Set<string>();
  if (procura.etiquetas?.some((id) => !tem.has(id))) return false;
  if (procura.semEixo?.some((eixo) => [...tem].some((id) => eixoDe(id) === eixo))) return false;
  if (procura.porConfirmar && !porConfirmar) return false;
  return true;
}

/** Uma procura sem exigências nenhumas — devolve a biblioteca inteira. */
export function procuraVazia(p: Procura): boolean {
  return !p.etiquetas?.length && !p.semEixo?.length && !p.porConfirmar && !p.pasta;
}

/**
 * Quantas fotos há por etiqueta — os números que os chips mostram ao lado de
 * cada valor, para se saber o que vale a pena filtrar antes de o filtrar.
 */
export function contagemPorEtiqueta(ligacoes: readonly FotoEtiqueta[]): Map<string, number> {
  const contas = new Map<string, number>();
  for (const l of ligacoes) contas.set(l.etiquetaId, (contas.get(l.etiquetaId) ?? 0) + 1);
  return contas;
}
