import type { ThemeImage } from "@/lib/theme-types";
import { type SkipReason } from "@/lib/theme-types";

/**
 * Os tipos do estado da pasta de um tema: o que ela sabe, o que falhou, o que
 * foi saltado, o que está em verificação, à espera, a seguir, e a geração de
 * miniaturas. (Saíram do `Temas.tsx` na fase 8 de `docs/ESTRUTURA-DO-CODIGO.md`.)
 */

/** Um pedido do menu do tema que só a PASTA sabe servir — ver `pedirAPasta`. */
export interface PedidoAPasta {
  temaId: string;
  accao: "adicionar" | "renomear" | "capa";
}

/** O que a pasta sabe e o cartão do tema precisa de saber. */
export interface FolderState {
  total: number | null;
  truncated: boolean;
  /** A fotografia da capa, inteira — e não só o endereço: o cartão precisa
   *  dos quatro campos dela (ver `capa-do-cartao.ts`). `undefined` = não se
   *  sabe (deixar o cartão como está); `null` = pasta vazia. */
  capa?: ThemeImage | null;
}

/** Uma foto que não subiu, com o ficheiro guardado para se poder repetir. */
export interface Failure {
  file: File;
  message: string;
}

/**
 * Uma foto do arrasto que NÃO foi adicionada por já lá estar.
 *
 * Guarda o `File` em memória (como o `Failure` acima) para o "Adicionar mesmo
 * assim" não obrigar a voltar a escolher nada — e para a miniatura do
 * relatório sair de graça, do ficheiro que já está no computador dela.
 *
 * ISTO NÃO É UM ERRO e não pode aparecer a vermelho: é o comportamento que ela
 * pediu, a acontecer.
 */
export interface Skipped {
  file: File;
  reason: SkipReason;
  /** O resumo, para o "Adicionar mesmo assim" não ter de o recalcular. */
  hash?: string;
}

/** O que a fase de verificação decidiu sobre um arrasto. */
export interface Screening {
  /** As que devem mesmo subir, pela ordem em que ela as largou. */
  keep: File[];
  skipped: Skipped[];
  /** `ficheiro → resumo`, para viajar no formulário do carregamento. */
  hashOf: Map<File, string>;
  /** A pasta foi mesmo lida e percorrida até ao fim. `false` = não se pode
   *  anunciar poupança nenhuma (ver o painel de repetidas). */
  verified: boolean;
  /** O tema tem fotos sem impressão digital (a biblioteca anterior a isto). */
  legacy: boolean;
}

/**
 * Uma foto que ela largou e que ainda vai a caminho do servidor.
 *
 * Existe para uma coisa só: a foto aparecer na grelha NO MOMENTO em que ela a
 * larga, a partir do ficheiro que já está no computador — em vez de o ecrã
 * ficar com um espaço vazio durante os segundos que a subida demora.
 */
export interface Pending {
  /** Chave local da célula (a foto ainda não tem caminho no servidor). */
  id: string;
  name: string;
  /** URL de objeto da foto local. `undefined` = ainda não há (ou o navegador
   *  não sabe fazer URLs de objeto) e a célula fica um retângulo à espera. */
  src?: string;
}

/** A página seguinte, pedida antes de ela a pedir. */
export interface Ahead {
  /** O offset com que foi pedida: se a grelha entretanto mudou de tamanho
   *  (subiu ou saiu uma foto), esta página deixou de encaixar e deita-se fora. */
  offset: number;
  images: ThemeImage[];
  total: number | null;
  truncated: boolean;
  full: boolean;
}

/** O andamento da geração de miniaturas em falta. */
export interface ThumbJob {
  running: boolean;
  /** Por onde vai a passagem pela pasta (é o que a torna retomável). */
  cursor: number;
  scanned: number;
  generated: number;
  failed: number;
  /** Fotos do tema, segundo o servidor. `null` = ainda não se sabe. */
  total: number | null;
  /** Acabou de percorrer a pasta toda. */
  complete: boolean;
}
