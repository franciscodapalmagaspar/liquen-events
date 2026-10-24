// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import SafeImage from "./SafeImage";

/**
 * Auditoria externa, A6: nas grelhas dos serviços o desfoque dava lugar à
 * fotografia num salto. Com `aparecer`, depois de hidratar e só se a foto
 * ainda não chegou, um véu com o mesmo desfoque fica POR CIMA e esbate-se em
 * 300 ms quando ela chega. O HTML do servidor não muda: sem JavaScript não
 * há véu nenhum.
 */
const SRC = "/imagens/EW1_1100.jpg";
const BLUR = "data:image/webp;base64,AAAA";

afterEach(cleanup);

function montar(aparecer?: boolean) {
  return render(
    <div style={{ position: "relative", width: 200, height: 200 }}>
      <SafeImage
        src={SRC}
        alt="Foto"
        fill
        sizes="200px"
        blurDataURL={BLUR}
        placeholder="blur"
        aparecer={aparecer}
      />
    </div>,
  );
}
const veu = (c: HTMLElement) => c.querySelector<HTMLImageElement>('img[aria-hidden="true"]');
const foto = (c: HTMLElement) => c.querySelector<HTMLImageElement>('img[alt="Foto"]')!;

describe("SafeImage — o desfoque esbate-se quando a foto chega (A6)", () => {
  it("com `aparecer={false}` não há véu", () => {
    const { container } = montar(false);
    expect(veu(container)).toBeNull();
  });

  it("é o comportamento por omissão de uma imagem `fill` com desfoque (16/10)", () => {
    // Ela: «ainda dá para ver a foto desfocada… a entrada nas páginas não está
    // muito boa». A fotografia passava do desfoque à nitidez num salto.
    const { container } = montar();
    expect(veu(container)).not.toBeNull();
  });

  it("com a foto por chegar: véu por cima, a 100%, com o tempo da casa", () => {
    const { container } = montar(true);
    const v = veu(container)!;
    expect(v).not.toBeNull();
    expect(v.getAttribute("src")).toBe(BLUR);
    expect(v.style.opacity).toBe("1");
    expect(v.className).toContain("duration-foto-chega");
    expect(v.className).toContain("pointer-events-none");
  });

  it("a foto chega: o véu passa a 0 e sai quando a transição acaba", async () => {
    const { container } = montar(true);
    // O next/image só chama o `onLoad` depois de um `decode()` — assíncrono.
    await act(async () => {
      fireEvent.load(foto(container));
    });
    const v = veu(container)!;
    expect(v.style.opacity).toBe("0");
    act(() => {
      fireEvent.transitionEnd(v);
    });
    expect(veu(container)).toBeNull();
  });
});

describe("SafeImage — o véu escuro dos heróis (ela, 24/10: «um flash branco»)", () => {
  it("com `veuEscuro` o véu leva metade da luz; sem ele fica como era", () => {
    const escuro = render(
      <div style={{ position: "relative", width: 200, height: 200 }}>
        <SafeImage
          src={SRC}
          alt="Foto"
          fill
          sizes="200px"
          blurDataURL={BLUR}
          placeholder="blur"
          veuEscuro
        />
      </div>,
    );
    expect(veu(escuro.container)!.className).toContain("brightness-50");
    cleanup();
    const { container } = montar(true);
    expect(veu(container)!.className).not.toContain("brightness-50");
  });
});
