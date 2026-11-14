/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE UMA VERIFICAÇÃO DE FOTOGRAFIAS RESPONDE — sem servidor nenhum
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Separado do `proposta-fotos-verificacao.ts` (que importa `server-only`, o
 * Storage e o registo) para o PAINEL DO ESTÚDIO poder ler os tipos e as frases
 * sem arrastar o Supabase para dentro do pacote do browser. É a mesma divisão
 * do `contract-types.ts` / `contracts-store.ts`, e há um teste da casa a
 * prendê-la — foi ele que a exigiu.
 */

/** Porque é que uma fotografia do documento não vai aparecer. */
export type MotivoDeFalta =
  /** O caminho está no documento e o ficheiro não está no bucket do pedido. */
  | "nao-esta-no-bucket"
  /** `tema:…` que já não existe na Biblioteca (apagada sem materializar). */
  | "saiu-da-biblioteca"
  /** `pending:` — o lugar foi reservado e a cópia nunca chegou a acontecer. */
  | "por-copiar";

export interface FotoEmFalta {
  /** O id opaco da fotografia neste documento (`b0f2`), como em `proposta-fotos`. */
  id: string;
  /** Onde ela está, em português: «Mood board «Lapelas» · foto 1». */
  onde: string;
  motivo: MotivoDeFalta;
}

/**
 * Uma fotografia que ELA escolheu para uma página do PDF (`fotosDasPaginas`) e
 * que já não existe. Trava o envio (`oQueFaltaParaEnviar`, id
 * `foto-escolhida-em-falta`): o PDF não pode pôr outra no lugar dela, e um
 * lugar vazio na proposta do casal é um erro — 14/11, ver
 * `pdf-editorial/embutir.ts`.
 */
export interface FotoEscolhidaEmFalta {
  /** O caminho tal como está no documento (`tema:…` ou `<pedido>/<uuid>.jpg`). */
  ref: string;
  /** A página onde ela a pôs, pelo nome do plano («Cerimónia», «Índice»…). */
  pagina: string;
  /** O nome do tema da Biblioteca de onde vinha, se se sabe. */
  tema: string | null;
  /** Está na Reciclagem (e pode repor-se)? */
  naReciclagem: boolean;
}

export interface VerificacaoDeFotos {
  /** Quantas fotografias o documento declara. */
  total: number;
  emFalta: FotoEmFalta[];
  /**
   * As de `emFalta` que ela escolheu para uma página do PDF, com a página e o
   * tema — as que TRAVAM o envio. Ausente numa resposta antiga.
   */
  escolhidasQueFaltam?: FotoEscolhidaEmFalta[];
  /**
   * As que estão lá e não deviam ir assim: medida de site de partilha, ou
   * pequenas demais para o sítio onde são desenhadas. Não impedem nada — ver
   * o bloco «A FOTOGRAFIA QUE ESTÁ LÁ, MAS NÃO DEVIA IR ASSIM».
   */
  suspeitas: FotoSuspeita[];
  /**
   * Endereços que não se conseguem verificar daqui: `http(s)` escritos à mão.
   * Não são um defeito — são um «não sei», e dizê-lo é melhor do que os contar
   * como bons ou como maus.
   */
  naoVerificaveis: number;
  /**
   * A verificação CORREU? `false` quando não há Storage configurado (o
   * ambiente local, uma pré-visualização) — e aí `emFalta` vazio quer dizer
   * «não se sabe», nunca «está tudo bem». Quem mostra isto no ecrã TEM de
   * distinguir as duas coisas: um «tudo bem» dado por uma verificação que não
   * correu é exactamente a mentira que este módulo existe para acabar.
   */
  verificou: boolean;
}

/** O que cada motivo quer dizer, para quem lê o aviso no back office. */
export const PORQUE_FALTA: Readonly<Record<MotivoDeFalta, string>> = {
  "nao-esta-no-bucket":
    "o ficheiro não está no armazenamento deste pedido — foi apagado, ou o carregamento não chegou ao fim",
  "saiu-da-biblioteca":
    "veio da Biblioteca de Temas e já lá não está — foi apagada sem passar por aqui",
  "por-copiar": "a foto foi escolhida e a cópia nunca chegou a acontecer",
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FOTOGRAFIA QUE ESTÁ LÁ, MAS NÃO DEVIA IR ASSIM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Numa proposta que seguiu, uma foto do Seating Plan levava a marca de
 * utilizador do Pinterest gravada no canto, e outra das Lapelas tinha um ícone
 * escuro por cima. Nenhuma das duas «falta»: estão no armazenamento, resolvem,
 * desenham-se. O defeito é outro — é o que está DENTRO dos pixéis.
 *
 * ── O QUE UMA MÁQUINA PODE E NÃO PODE DIZER AQUI ─────────────────────────
 *
 * Não pode ver uma marca de água. Uma marca gravada nos pixéis de uma foto de
 * flores é, para qualquer conta que se faça, um borrão claro entre borrões
 * claros; um detector honesto acusaria ramos e deixaria passar marcas, e um
 * aviso que se engana deixa de se ler ao terceiro engano.
 *
 * O que pode dizer é a MEDIDA, e a medida é uma pista verdadeira. Quem guarda
 * uma imagem do Pinterest não guarda o original: guarda o ficheiro que o site
 * serve, e esse sai com uma de meia dúzia de larguras fixas. Uma fotografia com
 * exactamente 736 píxeis de largura não veio de uma máquina fotográfica.
 *
 * E pode dizer o TAMANHO contra o sítio: uma foto que vai ser desenhada com o
 * dobro dos píxeis que tem sai desfocada, com marca ou sem ela.
 *
 * As duas juntas apanham a maioria das que a incomodam. A que sobra — a marca
 * de água numa foto grande — apanha-se de uma maneira só, que é ela olhar; e é
 * para isso que o painel mostra as fotografias todas antes de o link seguir.
 */
export type MotivoSuspeito =
  /** A largura é uma das que os sites de partilha servem: 236, 474, 564, 736. */
  | "medida-de-partilha"
  /** Tem menos píxeis do que a caixa onde vai ser desenhada. */
  | "pequena-demais";

export interface FotoSuspeita {
  id: string;
  /** «Mood board «Lapelas» · foto 3», como nas que faltam. */
  onde: string;
  motivo: MotivoSuspeito;
  largura: number;
  altura: number;
}

/**
 * As larguras com que os sites de partilha servem imagens.
 *
 * São as do Pinterest, que é de onde vem a inspiração toda. Não são «medidas
 * pequenas» — são medidas EXACTAS, e é isso que faz a pista valer: uma foto
 * tirada por um fotógrafo e reduzida por ela dava 735 ou 740 tão facilmente
 * como 736.
 */
export const LARGURAS_DE_PARTILHA: readonly number[] = [236, 474, 564, 736];

/** O que cada suspeita quer dizer, para quem lê o aviso no back office. */
export const PORQUE_SUSPEITA: Readonly<Record<MotivoSuspeito, string>> = {
  "medida-de-partilha":
    "tem exactamente a largura com que o Pinterest serve as imagens — é o ficheiro do site, não o original, e costuma trazer a marca do utilizador gravada num canto",
  "pequena-demais":
    "vai ser desenhada maior do que é, e sai desfocada — na proposta em papel e na página",
};
