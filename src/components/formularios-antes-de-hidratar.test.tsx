// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import PedidoRapido, { TEXTOS_PT } from "./ads/PedidoRapido";
import PedidoRelampago, { RELAMPAGO_PT } from "./meta/PedidoRelampago";

/**
 * OS FORMULÁRIOS DOS ANÚNCIOS ANTES (E LOGO DEPOIS) DE A PÁGINA GANHAR VIDA.
 *
 * Visto num browser a 17/11 (verificação do legal): um toque em «Enviar»
 * antes da hidratação seguia o GET nativo e levava o nome e o contacto para o
 * ENDEREÇO. O botão passou a vir desligado do servidor (`useJaHidratado`).
 * A revisão dessa correção achou o resto, que também se prende aqui:
 *
 *  · o que ela escreveu ANTES de hidratar não se pode perder — o telemóvel é
 *    controlado, e o campo escondido que segue no `FormData` ficava vazio;
 *    a data escolhida ficava invisível no toque (`text-transparent`);
 *  · sem JavaScript, o botão desligado precisa de dizer porquê e qual é a
 *    alternativa (`<noscript>`);
 *  · dois toques seguidos não podem dar dois pedidos: o primeiro `await`
 *    (as regras do telefone) chegava antes do `setAEnviar`.
 *
 * Tudo com `renderToString` + `hydrateRoot` a sério: é o caminho que a página
 * faz, e um `render` do testing-library salta-o.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/meta/enviar", () => ({
  meta: { comecouFormulario: vi.fn(), lead: vi.fn(() => "evt-1") },
}));
vi.mock("@/lib/anti-spam/useSeloDoFormulario", () => ({
  useSeloDoFormulario: () => async () => "SELO-DE-TESTE",
}));

const envios: string[] = [];
beforeEach(() => {
  envios.length = 0;
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/orcamento")) envios.push(String(init?.body));
      // Lento de propósito: o segundo toque chega enquanto o primeiro espera.
      await new Promise((r) => setTimeout(r, 50));
      return { ok: true, status: 200, json: async () => ({ id: "LIQ-AAA-1" }) };
    }),
  );
});

let raiz: Root | null = null;
afterEach(() => {
  act(() => raiz?.unmount());
  raiz = null;
  document.body.innerHTML = "";
  cleanup();
  vi.unstubAllGlobals();
});

const FORMULARIOS = [
  {
    nome: "PedidoRapido",
    el: () => <PedidoRapido locale="pt" textos={TEXTOS_PT} contexto="polo:alentejo" />,
  },
  {
    nome: "PedidoRelampago",
    el: () => <PedidoRelampago locale="pt" textos={RELAMPAGO_PT} contexto="s/comporta" />,
  },
] as const;

/** O HTML do servidor, posto na página como o browser o recebe. */
function htmlDoServidor(el: React.ReactElement): HTMLDivElement {
  const caixa = document.createElement("div");
  caixa.innerHTML = renderToString(el);
  document.body.appendChild(caixa);
  return caixa;
}

async function hidratar(caixa: HTMLElement, el: React.ReactElement) {
  await act(async () => {
    raiz = hydrateRoot(caixa, el);
  });
}

const botao = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('button[type="submit"]')!;

for (const { nome, el } of FORMULARIOS) {
  describe(`${nome} — antes e logo depois de hidratar`, () => {
    it("no HTML do servidor o «Enviar» vem desligado", () => {
      const caixa = htmlDoServidor(el());
      expect(botao(caixa).disabled).toBe(true);
    });

    it("depois de hidratar o «Enviar» liga-se", async () => {
      const caixa = htmlDoServidor(el());
      await hidratar(caixa, el());
      expect(botao(caixa).disabled).toBe(false);
    });

    it("sem JavaScript, por baixo do botão diz como pedir na mesma (email e WhatsApp)", () => {
      const caixa = htmlDoServidor(el());
      const aviso = caixa.querySelector("noscript");
      expect(aviso).not.toBeNull();
      // O `<noscript>` de um documento com JavaScript guarda o conteúdo como texto.
      expect(aviso!.innerHTML).toContain("mailto:liquen.alentejo@gmail.com");
      expect(aviso!.innerHTML).toContain("https://wa.me/351919259820");
    });

    it("a data escolhida antes de hidratar continua à vista no toque", async () => {
      const caixa = htmlDoServidor(el());
      const data = caixa.querySelector<HTMLInputElement>('input[name="data"]')!;
      data.value = "2030-06-12";
      await hidratar(caixa, el());
      expect(data.value).toBe("2030-06-12");
      expect(data.className).not.toContain("pointer-coarse:text-transparent");
    });

    it("dois toques seguidos dão UM pedido", async () => {
      const { container } = render(el());
      const f = container.querySelector("form")!;
      const preencher = (n: string, v: string) =>
        fireEvent.change(container.querySelector(`input[name="${n}"]`)!, { target: { value: v } });
      preencher("data", "2030-06-12");
      preencher("local", "Évora");
      preencher("nome", "Ana Dias");
      if (container.querySelector('input[name="convidados"]')) preencher("convidados", "120");
      if (container.querySelector('input[name="email"]')) preencher("email", "ana@exemplo.pt");
      if (container.querySelector('input[name="contacto"]')) preencher("contacto", "912345678");
      // O telemóvel faz o envio esperar pelas regras ANTES de marcar «a enviar».
      const tel = container.querySelector<HTMLInputElement>('input[type="tel"]');
      if (tel) fireEvent.change(tel, { target: { value: "912345678" } });
      fireEvent.submit(f);
      fireEvent.submit(f);
      await waitFor(() => expect(envios.length).toBeGreaterThan(0));
      await new Promise((r) => setTimeout(r, 200));
      expect(envios).toHaveLength(1);
    });
  });
}

describe("PedidoRapido — o telemóvel escrito antes de hidratar", () => {
  it("segue no campo escondido do FormData, e não se apaga ao desenhar de novo", async () => {
    const caixa = htmlDoServidor(FORMULARIOS[0].el());
    const visivel = caixa.querySelector<HTMLInputElement>('input[type="tel"]')!;
    visivel.value = "912345678";
    await hidratar(caixa, FORMULARIOS[0].el());
    const escondido = () => caixa.querySelector<HTMLInputElement>('input[name="telefone"]')!;
    await waitFor(() => expect(escondido().value).toContain("912345678"));
    // Desenhar de novo (um erro que aparece, por exemplo) não o leva.
    await act(async () => raiz!.render(FORMULARIOS[0].el()));
    expect(visivel.value).toContain("912");
    expect(escondido().value).toContain("912345678");
  });
});
