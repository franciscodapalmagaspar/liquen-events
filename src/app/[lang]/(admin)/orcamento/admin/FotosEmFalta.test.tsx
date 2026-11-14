// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FotosEmFalta from "./FotosEmFalta";
import type { ProposalDoc } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O AVISO QUE TINHA DE EXISTIR ANTES DE O LINK SEGUIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Quatro fotografias que não existiam no armazenamento seguiram numa proposta,
 * e a primeira pessoa a dar por isso foi o casal.
 *
 * A afirmação mais importante deste ficheiro é a última: **«não consegui
 * verificar» tem de se ler diferente de «está tudo bem»**. É a única resposta
 * que se pode confundir com a boa, e confundi-las é repetir o defeito com um
 * painel novo por cima.
 */

const DOC = { moodBoards: [] } as unknown as ProposalDoc;

let responde: () => Response;
const fetchMock = vi.fn(async () => responde());

const ok = (corpo: unknown) => ({ ok: true, json: async () => corpo }) as unknown as Response;

beforeEach(() => {
  responde = () =>
    ok({ total: 3, emFalta: [], suspeitas: [], naoVerificaveis: 0, verificou: true });
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("quando está tudo no sítio", () => {
  it("di-lo com o número, e não fica calado", async () => {
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/3 fotografias estão todas no sítio/i)).toBeTruthy();
  });

  it("sem fotografia nenhuma não diz que estão «todas no sítio» (auditoria de 14/11)", async () => {
    responde = () =>
      ok({ total: 0, emFalta: [], suspeitas: [], naoVerificaveis: 0, verificou: true });
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText("Ainda não há fotografias na proposta.")).toBeTruthy();
    expect(screen.queryByText(/0 fotografias/)).toBeNull();
  });

  it("com uma só, fala no singular", async () => {
    responde = () =>
      ok({ total: 1, emFalta: [], suspeitas: [], naoVerificaveis: 0, verificou: true });
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText("A fotografia está no sítio.")).toBeTruthy();
  });

  it("as fotos de fora contam-se à parte", async () => {
    responde = () =>
      ok({ total: 3, emFalta: [], suspeitas: [], naoVerificaveis: 1, verificou: true });
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/endereço de fora/i)).toBeTruthy();
  });
});

describe("quando falta alguma", () => {
  const comFalta = () =>
    ok({
      total: 5,
      suspeitas: [],
      naoVerificaveis: 0,
      verificou: true,
      emFalta: [
        {
          id: "b0f0",
          onde: "Mood board «Decoração Seating Plan» · foto 1",
          motivo: "nao-esta-no-bucket",
        },
        { id: "b1f2", onde: "Mood board «Lapelas» · foto 3", motivo: "nao-esta-no-bucket" },
      ],
    });

  it("diz quantas e NOMEIA cada uma pelo sítio", async () => {
    // «Mood board «Lapelas» · foto 3» é o que a leva lá em trinta segundos.
    responde = comFalta;
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/2 fotografias não vão aparecer ao casal/i)).toBeTruthy();
    expect(screen.getByText("Mood board «Decoração Seating Plan» · foto 1")).toBeTruthy();
    expect(screen.getByText("Mood board «Lapelas» · foto 3")).toBeTruthy();
  });

  it("explica a causa em português, não com o nome do motivo", async () => {
    responde = comFalta;
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/não está no armazenamento deste pedido/i)).toBeTruthy();
    expect(screen.queryByText(/nao-esta-no-bucket/)).toBeNull();
  });

  it("é um aviso, não uma tranca — não há aqui botão nenhum a impedir o envio", async () => {
    // Uma proposta que tem de sair hoje sai hoje. O que não pode é sair sem
    // ela saber.
    responde = comFalta;
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    await screen.findByText(/2 fotografias não vão aparecer/i);
    expect(screen.queryByRole("button", { name: /impedir|bloquear|cancelar/i })).toBeNull();
  });

  it("deixa voltar a confirmar depois de corrigir", async () => {
    responde = comFalta;
    const user = userEvent.setup();
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    await screen.findByText(/2 fotografias não vão aparecer/i);
    responde = () =>
      ok({ total: 5, emFalta: [], suspeitas: [], naoVerificaveis: 0, verificou: true });
    await user.click(screen.getByRole("button", { name: /Já corrigi/i }));
    expect(await screen.findByText(/estão todas no sítio/i)).toBeTruthy();
  });
});

/**
 * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────────
 */
describe("«não consegui verificar» nunca se lê como «está tudo bem»", () => {
  it("com a verificação por correr, di-lo com todas as letras", async () => {
    responde = () =>
      ok({ total: 3, emFalta: [], suspeitas: [], naoVerificaveis: 0, verificou: false });
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/Não foi possível confirmar/i)).toBeTruthy();
    expect(screen.getByText(/não quer dizer que estejam bem/i)).toBeTruthy();
    // E NÃO diz o contrário.
    expect(screen.queryByText(/estão todas no sítio/i)).toBeNull();
  });

  it("um erro de rede lê-se igual — e oferece tentar outra vez", async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new Error("rede em baixo");
    });
    const user = userEvent.setup();
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/Não foi possível confirmar/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Tentar outra vez/i }));
    expect(await screen.findByText(/estão todas no sítio/i)).toBeTruthy();
  });

  it("manda o documento que está NO ECRÃ, não vai buscar o gravado", async () => {
    // O estúdio grava com 800 ms de atraso, e a foto que ela acabou de trocar é
    // precisamente a que se quer verificar.
    render(<FotosEmFalta quoteId="LIQ-9" doc={{ ...DOC, ref: "PO Decoração" } as ProposalDoc} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orcamento/LIQ-9/fotos-em-falta");
    expect(JSON.parse(String(init.body)).doc.ref).toBe("PO Decoração");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS QUE ESTÃO LÁ E NÃO DEVIAM IR ASSIM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uma foto do Seating Plan levava a marca de utilizador do Pinterest gravada
 * no canto. Não «faltava»: estava no armazenamento, resolvia, desenhava-se.
 *
 * O que este painel pode dizer é a MEDIDA. O que ele NÃO pode dizer é o que
 * está dentro dos pixéis — e a última afirmação daqui é que ele o admite em
 * vez de deixar ficar a impressão de que olhou.
 */
describe("as fotografias que vão sair pior do que deviam", () => {
  const comSuspeitas = () =>
    ok({
      total: 4,
      emFalta: [],
      naoVerificaveis: 0,
      verificou: true,
      suspeitas: [
        {
          id: "b0f1",
          onde: "Mood board «Seating Plan» · foto 2",
          motivo: "medida-de-partilha",
          largura: 736,
          altura: 1104,
        },
        {
          id: "b1f0",
          onde: "Mood board «Lapelas» · foto 1",
          motivo: "pequena-demais",
          largura: 640,
          altura: 480,
        },
      ],
    });

  it("nomeia cada uma e diz a medida que a denuncia", async () => {
    responde = comSuspeitas;
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/2 fotografias vão sair pior/i)).toBeTruthy();
    expect(screen.getByText("Mood board «Seating Plan» · foto 2")).toBeTruthy();
    expect(screen.getByText("(736×1104)")).toBeTruthy();
  });

  it("explica a causa em português, não com o nome do motivo", async () => {
    responde = comSuspeitas;
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/largura com que o Pinterest serve/i)).toBeTruthy();
    expect(screen.queryByText(/medida-de-partilha/)).toBeNull();
  });

  it("aparece mesmo quando não falta nenhuma — são dois problemas diferentes", async () => {
    // Uma foto que falta volta ao armazenamento; uma foto com marca do
    // Pinterest troca-se por outra. «Está tudo no sítio» não responde à segunda.
    responde = comSuspeitas;
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/estão todas no sítio/i)).toBeTruthy();
    expect(screen.getByText(/2 fotografias vão sair pior/i)).toBeTruthy();
  });

  it("não trava nada — não há aqui botão a impedir o envio", async () => {
    responde = comSuspeitas;
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    await screen.findByText(/2 fotografias vão sair pior/i);
    expect(screen.queryByRole("button", { name: /impedir|bloquear|cancelar/i })).toBeNull();
  });

  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   */
  it("admite que não viu dentro da imagem", async () => {
    // Sem esta frase, uma lista de medidas lê-se como «olhei para as
    // fotografias e estão bem» — e a marca de água que passou é exactamente a
    // coisa que nenhuma conta viu.
    responde = comSuspeitas;
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/só se veem a olhar/i)).toBeTruthy();
  });

  it("sem suspeitas nenhumas, não inventa uma caixa vazia", async () => {
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    await screen.findByText(/estão todas no sítio/i);
    expect(screen.queryByText(/vão sair pior/i)).toBeNull();
  });
});
