import type { Quote } from "@/lib/orcamento/types";
import { AVISO_SEM_LIGACAO, moduloAPedido } from "@/lib/modulo-a-pedido";
import type { Avisar } from "./Toast";
import {
  abrirJanelaDeImpressao,
  JANELA_DA_TIMELINE,
  JANELA_DO_DOSSIER,
} from "./janelas-de-impressao";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * IMPRIMIR O PEDIDO SEM LEVAR A IMPRESSÃO NO PACOTE INICIAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As folhas de impressão e o .ics (`export.ts`, ~18 KB) só servem depois de
 * ela tocar no «⋯» do pedido; vêm a pedido (`moduloAPedido`) e são aquecidas
 * quando o painel abre.
 *
 * A JANELA abre-se no instante do clique, SEMPRE — antes de se saber se o
 * código já cá está. O browser só deixa abrir janelas com o gesto vivo, e um
 * `window.open` depois de uma espera era bloqueado em silêncio (o Safari do
 * iPhone, o Chrome): tocar em «Timeline» não fazia nada. Com a janela já
 * aberta, a folha escreve-se nela quando o código chegar. Se não chegar,
 * fecha-se e diz-se porquê.
 */
const impressao = moduloAPedido(() => import("./export"));

/** Traz o código da impressão para memória (ao abrir o painel). */
export const aquecerImpressao = (): void => {
  void impressao.aquecer();
};

export type FolhaDoPedido = "timeline" | "dossier";

export function imprimirOPedido(folha: FolhaDoPedido, q: Quote, avisar: Avisar): void {
  const janela = abrirJanelaDeImpressao(
    folha === "timeline" ? JANELA_DA_TIMELINE : JANELA_DO_DOSSIER,
  );
  // Bloqueada mesmo assim (um bloqueador de janelas): como antes, nada a fazer.
  if (!janela) return;
  void impressao
    .usar((m) =>
      folha === "timeline" ? m.printRunSheet(q, janela) : m.printEventDossier(q, janela),
    )
    .then((chegou) => {
      if (chegou) return;
      janela.close();
      avisar(AVISO_SEM_LIGACAO, "error");
    });
}

/** O evento em .ics: um descarregamento, que não precisa do gesto vivo. */
export function descarregarOCalendario(q: Quote, avisar: Avisar): void {
  void impressao
    .usar((m) => m.downloadEventIcs(q))
    .then((chegou) => {
      if (!chegou) avisar(AVISO_SEM_LIGACAO, "error");
    });
}
