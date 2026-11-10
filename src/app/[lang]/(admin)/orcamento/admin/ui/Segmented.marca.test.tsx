// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Segmented } from "./Segmented";
import { MARCA } from "./movimento";
import { fingirDisposicao, reporDisposicao } from "../../../../../../../test/disposicao-fingida";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PÍLULA NÃO ENTRA A DESLIZAR DO CANTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LEIA-SE ISTO ANTES DE ACREDITAR NO VERDE ─────────────────────────────
 *
 * O jsdom NÃO TEM DISPOSIÇÃO: `offsetWidth` é sempre zero e o `ResizeObserver`
 * (que aqui é um esboço inerte, ver `vitest.setup.ts`) nunca dispara. Sem o
 * duplo de `test/disposicao-fingida.ts` o `Segmented` nunca chega a ter pílula
 * nenhuma, e um teste sobre ela mede o vazio — verde, e a dizer nada. Onde a
 * pílula PÁRA mede-se num browser; o que se prende aqui é a canalização à volta
 * da medida, que é lógica e não pixéis. A mesma divisão de trabalho está escrita
 * por extenso em `ui/useMarcaQueAnda.test.tsx`.
 *
 * ── O QUE ESTE FICHEIRO GUARDA ───────────────────────────────────────────
 *
 * **O primeiro fotograma não anda.** A posição da pílula só se sabe MEDINDO, e
 * medir precisa do browser: entre o HTML do servidor e a primeira medida não há
 * pílula nenhuma. Se ela nascesse já com a transição ligada, o que se via ao
 * abrir o ecrã era um filete branco a deslizar do canto superior esquerdo até
 * ao segmento activo — um movimento que ninguém provocou, a anunciar uma
 * transição que não houve. É a regra da casa ao contrário: o movimento indica
 * direcção e ORIGEM, e aqui não há origem nenhuma.
 *
 * A partir da segunda medida anda, e aí está certo: a origem é o segmento onde
 * ela estava.
 */

const OPCOES = [
  { value: "list", label: "Lista" },
  { value: "board", label: "Quadro" },
];

const pilula = () =>
  document.querySelector<HTMLElement>('[role="radiogroup"] > span[aria-hidden="true"]');

/** Deixa passar o fotograma que o `podeAnimar` espera. */
async function passarUmFotograma() {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 0));
  });
}

/**
 * ── AS MEDIDAS CHEGAM PELO `ResizeObserver` (10/11) ─────────────────────────
 * O controlo deixou de se medir a cada desenho (era layout forçado a cada letra
 * no estúdio): mede-se ao montar, quando muda o segmento, e quando o browser
 * diz que um tamanho mudou. O duplo do `vitest.setup.ts` não faz nada; aqui
 * guarda-se quem pediu para ser avisado, para o teste poder dizer «mudou».
 */
const avisados: ResizeObserverCallback[] = [];
const RoOriginal = globalThis.ResizeObserver;
beforeEach(() => {
  avisados.length = 0;
  globalThis.ResizeObserver = class {
    constructor(aoMudar: ResizeObserverCallback) {
      avisados.push(aoMudar);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
const mudouOTamanho = () =>
  avisados.forEach((f) => f([], undefined as unknown as ResizeObserver));

afterEach(() => {
  cleanup();
  reporDisposicao();
  globalThis.ResizeObserver = RoOriginal;
});

describe("a marca que anda do Segmented", () => {
  /**
   * O PRIMEIRO DESENHO É O DO SERVIDOR, e nele não há medidas nenhumas — por
   * isso o duplo só se liga DEPOIS dele. Não é um arranjo do teste: é a
   * sequência real. Enquanto ela não corre, `offsetWidth` é zero (o jsdom a
   * sério) e o `Segmented` sabe que ainda não tem pílula.
   *
   * Nota para quem mexer aqui: o duplo devolve **1** para um `offsetWidth` que
   * ninguém declarou (ver `test/disposicao-fingida.ts`), e não zero. Ligá-lo
   * antes do primeiro desenho dava uma pílula de 1×1 já medida — e os dois
   * testes deste ficheiro passavam a medir outra coisa sem se queixarem.
   */
  function ligarAsMedidas() {
    fingirDisposicao();
    const medidas: Record<string, { x: number; w: number }> = {
      Lista: { x: 4, w: 80 },
      Quadro: { x: 88, w: 92 },
    };
    for (const [rotulo, m] of Object.entries(medidas)) {
      const b = screen.getByRole("radio", { name: rotulo });
      b.dataset.x = String(m.x);
      b.dataset.y = "0";
      b.dataset.w = String(m.w);
      b.dataset.h = "36";
    }
  }

  const desenhar = (valor: string) => (
    <Segmented ariaLabel="Vista" value={valor} onChange={() => {}} options={[...OPCOES]} />
  );

  it("o fotograma da PRIMEIRA medida não anda — o seguinte já anda", async () => {
    const vista = render(desenhar("list"));
    // Antes de medir não há pílula nenhuma — é o desenho que vem do servidor.
    expect(pilula()).toBeNull();

    ligarAsMedidas();
    // O browser avisa que os tamanhos mudaram — é por aí que uma remedição a
    // sério chega (o `ResizeObserver` do componente), e não por o pai redesenhar.
    await act(async () => mudouOTamanho());

    const marca = pilula();
    expect(marca, "sem pílula não há nada a medir — o duplo das medidas falhou").not.toBeNull();
    expect(marca!.style.translate).toBe("4px 0px");
    expect(marca!.style.width).toBe("80px");

    for (const c of MARCA.split(/\s+/)) {
      expect(
        marca!.className,
        "a pílula nasceu com a transição ligada — ao abrir o ecrã desliza do canto",
      ).not.toContain(c);
    }

    await passarUmFotograma();
    for (const c of MARCA.split(/\s+/)) expect(pilula()!.className).toContain(c);

    // E a partir daqui ANDA, que é o gesto todo: outro segmento, outra posição,
    // com a transição já ligada.
    await act(async () => vista.rerender(desenhar("board")));
    expect(pilula()!.style.translate).toBe("88px 0px");
    expect(pilula()!.style.width).toBe("92px");
    expect(pilula()!.className).toContain("motion-safe:transition-[translate,width]");
  });

  /**
   * ── E ENQUANTO NÃO HÁ PÍLULA, O BOTÃO TRAZ O SEU FUNDO ───────────────────
   *
   * É a rede de antes da primeira medida. Sem ela o controlo aparecia sem nada
   * escolhido e corrigia-se à vista — que é o mesmo defeito, do outro lado.
   * Nunca há dois fundos, e nunca há nenhum.
   */
  it("antes de medida, o fundo do segmento activo é a rede — e sai quando ela chega", async () => {
    render(desenhar("list"));
    const activo = () => screen.getByRole("radio", { name: "Lista" });
    expect(pilula()).toBeNull();
    expect(activo().className.split(/\s+/)).toContain("bg-[var(--bo-surface)]");

    ligarAsMedidas();
    await act(async () => mudouOTamanho());

    expect(pilula()).not.toBeNull();
    expect(activo().className.split(/\s+/)).not.toContain("bg-[var(--bo-surface)]");
  });
});
