import type { EstadoDosUrls } from "../tipos";

/** O que uma célula de fotografia do estúdio recebe. Ver `Thumb`. */
export type PropriedadesDaCelula = {
  /** O `object-position` da imagem — o enquadramento da capa (`focoDaCapa`). */
  posicao?: string;
  url?: string;
  /**
   * PARA ONDE CAIR, do mais leve para o mais pesado.
   *
   * Uma cadeia é o caso antigo («cai para o original»). Uma lista é a cascata
   * inteira — nas grelhas do estúdio, `[derivada de 1200 px, original]`. Ver
   * `assetMedias`: entre a miniatura de 20 KB e o original de 1099 KB não havia
   * nada, e a queda custava cinquenta e cinco vezes o peso para desenhar a
   * mesma caixa de ~100 px.
   */
  planoB?: string | readonly (string | undefined)[];
  /** Em que pé está a leitura dos URL — ver `estadoDosUrls` no estúdio. */
  estadoDosUrls?: EstadoDosUrls;
  /** Ir buscar os URL outra vez, a pedido dela. */
  aoTentarDeNovo?: () => void;
  /**
   * Este URL não abre — dito ao estúdio, para a hidratação seguinte deixar de
   * o preferir ao fresco. Ver `urlsMortos`.
   */
  aoMorrer?: (url: string) => void;
  /** Está na primeira dobra: não espera pela fila nem pelo `lazy`. */
  priority?: boolean;
  onRemove: () => void;
  className?: string;
  /**
   * O ASPECTO DA CAIXA QUE ESTA FOTO VAI OCUPAR NO PDF.
   *
   * A célula pré-visualizava as capas em 4:3 e as fotos dos mood boards em
   * quadrado — e o documento não desenha NENHUMA foto em 4:3 nem NENHUMA em
   * quadrado. As capas são tiras altas (≈ 0,47:1, quase 1:2) e as células do
   * collage mudam de forma consoante o número de fotos do board.
   *
   * O resultado era ela escolher uma foto pelo que via e o cliente receber
   * outra coisa: a MESMA fotografia, cortada noutro sítio. Com uma tira de capa
   * tão estreita, os dois recortes podem não ter nada em comum — é a definição
   * de «desconfigurada», e não havia como descobri-lo sem gerar o PDF.
   *
   * Vem de `proposal-geometria`, a mesma função que o desenho usa. Em falta,
   * mantém-se o que o `className` disser.
   */
  aspeto?: number;
  /**
   * A FORMA REAL DESTA FOTOGRAFIA, dita assim que a célula consegue medi-la.
   *
   * A imagem que está aqui já foi descodificada pelo navegador — tem
   * `naturalWidth`/`naturalHeight` e não custa mais nada perguntar. É daqui que
   * o selector de disposição tira os aspectos com que desenha os diagramas (ver
   * `aspetosDasFotos`), em vez de haver um pedido novo por foto só para saber a
   * forma. Quando o URL é o da miniatura serve na mesma: a miniatura é gerada
   * dentro de uma caixa, conservando as proporções (ver `image-prep`).
   */
  onMedida?: (aspeto: number) => void;
  /** Esta foto está no rascunho mas a página do PDF já não a desenha. */
  foraDoPdf?: boolean;
  /** A foto já ocupa este lugar mas a cópia ainda não confirmou. */
  pendente?: boolean;
  /** Onde está esta célula, para os registos do servidor dizerem qual falhou. */
  onde?: string;
  /** O caminho no documento — o que se procura no Storage quando isto falha. */
  refDoc?: string;
  /**
   * Não desenhar o × desta célula.
   *
   * Nas grelhas dos mood boards a remoção passou para a barra de acções, que é
   * visível ao toque; o × da miniatura só aparecia em hover, e num telemóvel um
   * botão que só aparece em hover é um botão que não existe. As capas continuam
   * com ele — ali há duas células e nenhuma barra.
   */
  semRemover?: boolean;
};
