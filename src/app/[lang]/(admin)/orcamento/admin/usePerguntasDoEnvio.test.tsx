// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { passoParaCorrigir, usePerguntasDoEnvio } from "./usePerguntasDoEnvio";

/**
 * Revisão de 17/11, n.º 1 e n.º 6: a resposta «envia assim mesmo» às fotos em
 * falta era um booleano guardado no momento do clique — valia para qualquer
 * documento que estivesse à frente nessa altura, e não só para o que fez a
 * pergunta. E a resposta aos cortes não ficava lembrada, e ela podia ser
 * perguntada duas vezes pelos mesmos cortes.
 */
describe("as perguntas antes do envio", () => {
  const montar = (retrato: string) =>
    renderHook(({ r }) => usePerguntasDoEnvio(r), { initialProps: { r: retrato } });

  it("a resposta às fotos vale para o documento que fez a pergunta, e diz quantas", () => {
    const { result } = montar("A");
    act(() => result.current.perguntar({ tipo: "fotos", n: 9, retrato: "A" }));
    expect(result.current.pergunta).toMatchObject({ tipo: "fotos", n: 9 });
    let confirmou = false;
    act(() => {
      confirmou = result.current.confirmar();
    });
    expect(confirmou).toBe(true);
    expect(result.current.pergunta).toBeNull();
    expect(result.current.respostasPara("A")).toEqual({ fotosEmFaltaConfirmadas: 9 });
    expect(result.current.respostasPara("B"), "valeu para outro documento").toEqual({});
  });

  it("o documento mudou com a pergunta aberta: fecha-se, e o clique não confirma nada", () => {
    const { result, rerender } = montar("A");
    act(() => result.current.perguntar({ tipo: "fotos", n: 3, retrato: "A" }));
    rerender({ r: "B" });
    expect(result.current.pergunta, "a pergunta de A ficou aberta sobre B").toBeNull();
    let confirmou = true;
    act(() => {
      confirmou = result.current.confirmar();
    });
    expect(confirmou).toBe(false);
    expect(result.current.respostasPara("B")).toEqual({});
    expect(result.current.respostasPara("A")).toEqual({});
  });

  it("os cortes confirmados ficam lembrados por retrato, como as fotos", () => {
    const { result } = montar("A");
    act(() => result.current.perguntar({ tipo: "fotos", n: 2, retrato: "A" }));
    act(() => void result.current.confirmar());
    act(() =>
      result.current.perguntar({
        tipo: "cortes",
        cortes: [{ where: "Nome na capa", dropped: 1, unit: "linhas" }],
        retrato: "A",
      }),
    );
    act(() => void result.current.confirmar());
    expect(result.current.respostasPara("A")).toEqual({
      fotosEmFaltaConfirmadas: 2,
      cortesConfirmados: true,
    });
    // A proposta seguiu: nada fica para a próxima.
    act(() => result.current.esquecer());
    expect(result.current.respostasPara("A")).toEqual({});
  });

  it("«voltar e corrigir» leva ao passo do que falta", () => {
    expect(passoParaCorrigir({ tipo: "fotos", n: 1, retrato: "" })).toBe("inspiracao");
    const corte = (where: string, unit: "fotos" | "linhas") => ({
      tipo: "cortes" as const,
      cortes: [{ where, dropped: 1, unit }],
      retrato: "",
    });
    expect(passoParaCorrigir(corte("Mood board «Cerimónia»", "fotos"))).toBe("inspiracao");
    expect(passoParaCorrigir(corte("Nome na capa", "linhas"))).toBe("evento");
    expect(passoParaCorrigir(corte("Local", "linhas"))).toBe("servicos");
    expect(passoParaCorrigir({ tipo: "cortes", cortes: [], retrato: "" })).toBe("evento");
  });
});
