import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pedirVezDeImagemPesada, limparFilaDeImagens, ESPERA_MAXIMA_MS } from "./fila-de-imagens";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FILA EXISTE PARA A PRIMEIRA FOTOGRAFIA NÃO ESPERAR PELAS OUTRAS 23
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Medido no estúdio de propostas a 1,6 Mbps, 24 células sem miniatura: 24
 * originais pedidos ao mesmo tempo (1099 KB cada, 26,4 MB), a primeira
 * fotografia pintada aos **34,0 s** e a grelha visível completa aos **67,6 s**.
 * Com a fila, os mesmos ficheiros: **13,3 MB** (as de fora do ecrã nunca são
 * pedidas) e a grelha visível aos **49,4 s**.
 *
 * O que estes casos fixam é a única propriedade de que isso depende: que o
 * número de downloads em voo tem um TECTO, e que a vez volta sempre à fila.
 */
beforeEach(() => limparFilaDeImagens());

describe("a fila das imagens pesadas", () => {
  it("deixa arrancar três e segura as restantes", () => {
    const arrancaram: number[] = [];
    for (let i = 0; i < 8; i++) pedirVezDeImagemPesada(() => arrancaram.push(i));
    expect(arrancaram).toEqual([0, 1, 2]);
  });

  it("a vez larga passa à seguinte, pela ordem da grelha", () => {
    const arrancaram: number[] = [];
    const largar = Array.from({ length: 6 }, (_, i) =>
      pedirVezDeImagemPesada(() => arrancaram.push(i)),
    );
    expect(arrancaram).toEqual([0, 1, 2]);
    largar[0]();
    expect(arrancaram).toEqual([0, 1, 2, 3]);
    largar[1]();
    largar[2]();
    expect(arrancaram).toEqual([0, 1, 2, 3, 4, 5]);
  });

  /**
   * Largar duas vezes é o caso NORMAL, não o estranho: o `onLoad` da imagem e a
   * desmontagem da célula chegam os dois. Se cada um descontasse do contador, o
   * tecto subia sozinho e a fila deixava de valer nada.
   */
  it("largar a mesma vez duas vezes não abre uma vaga a mais", () => {
    const arrancaram: number[] = [];
    const largar = Array.from({ length: 6 }, (_, i) =>
      pedirVezDeImagemPesada(() => arrancaram.push(i)),
    );
    largar[0]();
    largar[0]();
    expect(arrancaram).toEqual([0, 1, 2, 3]);
  });

  /**
   * Uma célula que sai do ecrã antes de lhe tocar a vez sai da fila — e não
   * gasta a vaga de quem ficou. Sem isto, percorrer a página depressa deixava a
   * fila cheia de células que já ninguém está a ver.
   */
  it("desistir antes da vez não gasta vaga nenhuma", () => {
    const arrancaram: number[] = [];
    const largar = Array.from({ length: 6 }, (_, i) =>
      pedirVezDeImagemPesada(() => arrancaram.push(i)),
    );
    largar[3]();
    largar[0]();
    // A 3 saiu da fila: a vaga vai para a 4, não fica perdida nem duplicada.
    expect(arrancaram).toEqual([0, 1, 2, 4]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TECTO DE TEMPO CONTA O DOWNLOAD. NUNCA CONTA A ESPERA.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma fotografia que ainda nem começou a descarregar não está a falhar: está à
 * espera da vez. Se o relógio andasse desde o PEDIDO, a quarta célula de uma
 * grelha nascia com o cronómetro a correr e o tecto expirava em cima de quem
 * nunca gastou um byte — e a vaga que ele largava ia parar a uma célula que
 * também ainda não tinha começado. Uma fila que expira antes de servir é uma
 * fila que não serve.
 *
 * A propriedade que estes dois casos fixam é uma só: **o relógio de cada vez
 * arranca quando a vaga é CONCEDIDA**. Está do lado da fila, e não do lado da
 * célula, precisamente para poder ser fixado aqui.
 */
describe("o relógio da fila", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("não anda enquanto a vez está à espera — anda a partir da vez concedida", () => {
    const arrancaram: number[] = [];
    for (let i = 0; i < 5; i++) pedirVezDeImagemPesada(() => arrancaram.push(i));
    expect(arrancaram).toEqual([0, 1, 2]);

    // Um instante antes do tecto: ninguém largou nada, e a 3 continua à espera.
    vi.advanceTimersByTime(ESPERA_MAXIMA_MS - 1);
    expect(arrancaram).toEqual([0, 1, 2]);

    // Cumprido o tecto, as três que ESTAVAM A DESCARREGAR largam a vaga. A 3
    // entra — e é neste instante que o relógio DELA começa, não no pedido.
    vi.advanceTimersByTime(1);
    expect(arrancaram).toEqual([0, 1, 2, 3, 4]);
  });

  /**
   * O mesmo, visto do lado que interessa: a quarta esperou um tecto inteiro na
   * fila, e mesmo assim tem o tecto INTEIRO para descarregar. Com o relógio
   * armado no pedido, ela chegava à vez já expirada.
   */
  it("uma vez que esperou um tecto inteiro ainda tem o tecto inteiro para descarregar", () => {
    const arrancaram: number[] = [];
    for (let i = 0; i < 7; i++) pedirVezDeImagemPesada(() => arrancaram.push(i));
    expect(arrancaram).toEqual([0, 1, 2]);

    // Passa o primeiro tecto: as três de trás entram.
    vi.advanceTimersByTime(ESPERA_MAXIMA_MS);
    expect(arrancaram).toEqual([0, 1, 2, 3, 4, 5]);

    // Quase outro tecto inteiro DEPOIS de a 3 ter arrancado: a vaga dela ainda
    // é dela, e a 6 continua à espera.
    vi.advanceTimersByTime(ESPERA_MAXIMA_MS - 1);
    expect(arrancaram).toEqual([0, 1, 2, 3, 4, 5]);
    vi.advanceTimersByTime(1);
    expect(arrancaram).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
