// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import {
  useGravacaoAutomatica,
  textoDaGravacao,
  ATRASO_DA_GRAVACAO,
} from "./useGravacaoAutomatica";
import { enviarComRepeticao, respostaDeHttp, type RespostaDoEnvio } from "@/lib/gravar-com-tecto";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTES TESTES SEGURAM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada um destes casos nasceu de um estrago real no estúdio de propostas, e é
 * por isso que estão aqui: o hook é a extracção dessa cadeia, e uma extracção
 * que perde uma destas quatro coisas devolve o problema ao sítio de onde ele
 * veio.
 *
 *  1. o `clearTimeout` da gravação adiada corre em QUALQUER desmontagem — era
 *     assim que se perdia a última linha escrita antes de trocar de cliente;
 *  2. fechar o separador com trabalho por gravar tem de travar;
 *  3. uma ligação que caiu não pode matar a gravação à primeira — mas repetir
 *     um 4xx é esperar pela mesma resposta;
 *  4. «guardado» é a palavra que faz uma pessoa fechar o portátil descansada, e
 *     não se pode dizer antes de o servidor a confirmar.
 */

/** Um envio controlado à mão: sabe-se quantas vezes foi chamado, com que valor,
 *  e quando é que cada tentativa responde. */
function envioManual() {
  const chamadas: string[] = [];
  let resolver: ((r: RespostaDoEnvio) => void) | null = null;
  const enviar = vi.fn((valor: string) => {
    chamadas.push(valor);
    return new Promise<RespostaDoEnvio>((r) => {
      resolver = r;
    });
  });
  return {
    enviar,
    chamadas,
    responder: (r: RespostaDoEnvio) => {
      const f = resolver;
      resolver = null;
      f?.(r);
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // Sem isto os hooks de um teste ficam MONTADOS no seguinte — e um hook montado
  // com trabalho por gravar mantém o travão do `beforeunload` posto, que é
  // exactamente o que o último teste deste ficheiro mede.
  cleanup();
  vi.useRealTimers();
});

/** Deixa correr o relógio e as promessas que ele destranca. */
async function passar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useGravacaoAutomatica — a gravação adiada", () => {
  it("não grava a cada tecla: escrever três vezes seguidas dá UMA gravação", async () => {
    const enviar = vi.fn(async (): Promise<RespostaDoEnvio> => ({ estado: "guardado" }));
    const { rerender } = renderHook(({ valor }) => useGravacaoAutomatica({ valor, enviar }), {
      initialProps: { valor: "" },
    });

    rerender({ valor: "o" });
    rerender({ valor: "ol" });
    rerender({ valor: "olá" });
    await passar(ATRASO_DA_GRAVACAO - 1);
    expect(enviar).not.toHaveBeenCalled();

    await passar(2);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith("olá");
  });

  it("o valor com que se monta não conta como alteração — abrir não grava", async () => {
    const enviar = vi.fn(async (): Promise<RespostaDoEnvio> => ({ estado: "guardado" }));
    renderHook(() => useGravacaoAutomatica({ valor: "o que o servidor já tem", enviar }));
    await passar(ATRASO_DA_GRAVACAO * 2);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("gravarJa não espera pelo temporizador", async () => {
    const enviar = vi.fn(async (): Promise<RespostaDoEnvio> => ({ estado: "guardado" }));
    const { result, rerender } = renderHook(
      ({ valor }) => useGravacaoAutomatica({ valor, enviar }),
      { initialProps: { valor: "" } },
    );

    rerender({ valor: "já" });
    await act(async () => {
      await result.current.gravarJa();
    });
    expect(enviar).toHaveBeenCalledWith("já");
  });

  /**
   * ── GRAVAR JÁ DESARMA O ADIAMENTO ────────────────────────────────────────
   *
   * O adiamento ficava de pé depois de a gravação já ter acontecido por outra
   * porta (o botão «Guardar», o ⌘S, o «Guardar tudo»). Passados os 800 ms
   * disparava outra vez, com o mesmo texto: um segundo pedido ao servidor para
   * escrever o que lá estava, e — pior — o indicador a voltar de «guardado» a
   * «a guardar…» logo a seguir a lhe ter dito que estava tudo guardado. Nessa
   * janela o registo volta a contar este ecrã como tendo coisa por gravar, e
   * fechar o separador é travado por trabalho que já está no servidor.
   */
  it("gravar já desarma o adiamento — o mesmo texto não vai duas vezes", async () => {
    const manual = envioManual();
    const { result, rerender } = renderHook(
      ({ valor }) => useGravacaoAutomatica({ valor, enviar: manual.enviar }),
      { initialProps: { valor: "" } },
    );

    rerender({ valor: "a última linha" });

    let gravou: Promise<unknown> | undefined;
    act(() => {
      gravou = result.current.gravarJa();
    });
    await act(async () => {
      manual.responder({ estado: "guardado" });
      await gravou;
    });
    expect(result.current.estado).toBe("guardado");

    // Aqui é onde o temporizador esquecido disparava.
    await passar(ATRASO_DA_GRAVACAO * 2);
    expect(manual.chamadas).toEqual(["a última linha"]);
    expect(result.current.estado).toBe("guardado");
    expect(result.current.porGravar).toBe(false);
    expect(result.current.aCaminho).toBe(false);
  });
});

describe("useGravacaoAutomatica — descarregar o que ficou pendente", () => {
  /**
   * O percurso: escreve-se a última linha e clica-se em «Trocar de cliente»
   * dentro dos 800 ms. A limpeza do efeito cancelava o temporizador e a linha
   * ficava por gravar, com o indicador a dizer a hora da gravação ANTERIOR.
   */
  it("desmontar com trabalho por gravar grava-o à mesma", async () => {
    const enviar = vi.fn(async (): Promise<RespostaDoEnvio> => ({ estado: "guardado" }));
    const { rerender, unmount } = renderHook(
      ({ valor }) => useGravacaoAutomatica({ valor, enviar }),
      { initialProps: { valor: "" } },
    );

    rerender({ valor: "a última linha" });
    await act(async () => {
      unmount();
    });

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith("a última linha");
  });

  it("desmontar sem nada por gravar não paga um pedido para reescrever o mesmo", async () => {
    const enviar = vi.fn(async (): Promise<RespostaDoEnvio> => ({ estado: "guardado" }));
    const { unmount } = renderHook(() => useGravacaoAutomatica({ valor: "igual", enviar }));
    await act(async () => {
      unmount();
    });
    expect(enviar).not.toHaveBeenCalled();
  });

  /** Trocar de pedido no painel é o mesmo gesto sem desmontagem nenhuma: o hook
   *  continua montado e o valor troca-se por baixo dele. */
  it("mudar de chave descarrega o que ficou por gravar do ANTERIOR", async () => {
    const enviar = vi.fn(async (): Promise<RespostaDoEnvio> => ({ estado: "guardado" }));
    const { rerender } = renderHook(
      ({ valor, chave }) => useGravacaoAutomatica({ valor, chave, enviar }),
      { initialProps: { valor: "notas do A", chave: "A" } },
    );

    rerender({ valor: "notas do A, com mais uma linha", chave: "A" });
    await act(async () => {
      rerender({ valor: "notas do B", chave: "B" });
    });

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith("notas do A, com mais uma linha");

    // E o pedido novo entra limpo: o que ele traz do servidor não é uma
    // alteração por gravar só por ser diferente do pedido anterior.
    await passar(ATRASO_DA_GRAVACAO * 2);
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});

describe("useGravacaoAutomatica — repetir, e não repetir o que não vale a pena", () => {
  it("uma ligação que caiu não mata a gravação à primeira", async () => {
    const respostas: RespostaDoEnvio[] = [
      { estado: "falhou" },
      { estado: "falhou" },
      { estado: "guardado" },
    ];
    const enviar = vi.fn(async (): Promise<RespostaDoEnvio> => respostas.shift()!);
    const { result, rerender } = renderHook(
      ({ valor }) => useGravacaoAutomatica({ valor, enviar }),
      { initialProps: { valor: "" } },
    );

    rerender({ valor: "texto" });
    await passar(ATRASO_DA_GRAVACAO + 400 + 800 + 10);

    expect(enviar).toHaveBeenCalledTimes(3);
    expect(result.current.estado).toBe("guardado");
  });

  it("um 4xx não se repete — a resposta seguinte era a mesma", async () => {
    const enviar = vi.fn(
      async (): Promise<RespostaDoEnvio> =>
        respostaDeHttp(413, { porque: "A proposta é grande demais." }),
    );
    const { result, rerender } = renderHook(
      ({ valor }) => useGravacaoAutomatica({ valor, enviar }),
      { initialProps: { valor: "" } },
    );

    rerender({ valor: "texto" });
    await passar(ATRASO_DA_GRAVACAO + 5000);

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toBe("nao-chegou-ao-servidor");
    expect(result.current.naoChegouAoServidor?.porque).toMatch(/grande demais/);
  });

  it("uma falha permanente (503 com a tabela em falta) também não se repete", async () => {
    const enviar = vi.fn(
      async (): Promise<RespostaDoEnvio> =>
        respostaDeHttp(503, { porque: "A tabela não existe.", permanente: true }),
    );
    const { rerender } = renderHook(({ valor }) => useGravacaoAutomatica({ valor, enviar }), {
      initialProps: { valor: "" },
    });

    rerender({ valor: "texto" });
    await passar(ATRASO_DA_GRAVACAO + 5000);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("um 500 repete-se, e ao fim das tentativas desiste a dizer o que aconteceu", async () => {
    const enviar = vi.fn(async (): Promise<RespostaDoEnvio> => respostaDeHttp(500));
    const { result, rerender } = renderHook(
      ({ valor }) => useGravacaoAutomatica({ valor, enviar }),
      { initialProps: { valor: "" } },
    );

    rerender({ valor: "texto" });
    await passar(ATRASO_DA_GRAVACAO + 400 + 800 + 10);

    expect(enviar).toHaveBeenCalledTimes(3);
    expect(result.current.estado).toBe("nao-chegou-ao-servidor");
  });

  /** Nunca fazer uma edição falhar porque a gravação falhou. */
  it("um envio que ATIRA não rebenta o ecrã — é uma falha como as outras", async () => {
    const enviar = vi.fn(async (): Promise<RespostaDoEnvio> => {
      throw new Error("Failed to fetch");
    });
    const { result, rerender } = renderHook(
      ({ valor }) => useGravacaoAutomatica({ valor, enviar }),
      { initialProps: { valor: "" } },
    );

    rerender({ valor: "texto" });
    await passar(ATRASO_DA_GRAVACAO + 400 + 800 + 10);
    expect(result.current.estado).toBe("nao-chegou-ao-servidor");
  });
});

describe("useGravacaoAutomatica — os três estados, e a verdade de cada um", () => {
  it("enquanto o servidor não responde diz «a guardar…», e NÃO «guardado»", async () => {
    const { enviar, responder } = envioManual();
    const { result, rerender } = renderHook(
      ({ valor }) => useGravacaoAutomatica({ valor, enviar }),
      { initialProps: { valor: "" } },
    );

    rerender({ valor: "texto" });
    // Ainda dentro do adiamento: já há trabalho por gravar.
    expect(result.current.estado).toBe("a-guardar");
    expect(result.current.porGravar).toBe(true);

    await passar(ATRASO_DA_GRAVACAO + 1);
    // O pedido está a caminho e a resposta ainda não veio. Era exactamente aqui
    // que o ecrã dizia «guardado às 14:32» sem ninguém saber se tinha ficado.
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toBe("a-guardar");
    expect(result.current.texto?.longo).toBe("a guardar…");

    await act(async () => {
      responder({ estado: "guardado" });
    });
    expect(result.current.estado).toBe("guardado");
    expect(result.current.gravadoEm).toBeInstanceOf(Date);
    expect(result.current.texto?.longo).toMatch(/^guardado às \d{2}:\d{2}$/);
  });

  it("recusada, o indicador diz que não chegou ao servidor — e não fica um visto", async () => {
    const enviar = vi.fn(
      async (): Promise<RespostaDoEnvio> => ({
        estado: "falhou",
        porque: "O armazenamento recusou.",
        definitivo: true,
      }),
    );
    const { result, rerender } = renderHook(
      ({ valor }) => useGravacaoAutomatica({ valor, enviar }),
      { initialProps: { valor: "" } },
    );

    rerender({ valor: "texto" });
    await passar(ATRASO_DA_GRAVACAO + 1);

    expect(result.current.estado).toBe("nao-chegou-ao-servidor");
    expect(result.current.texto?.longo).not.toMatch(/^guardado/);
    expect(result.current.gravadoEm).toBeNull();
  });

  it("sem cópia local, uma gravação recusada não pode dizer «guardado» de maneira nenhuma", async () => {
    const enviar = vi.fn(
      async (): Promise<RespostaDoEnvio> => ({ estado: "falhou", definitivo: true }),
    );
    const { result, rerender } = renderHook(
      ({ valor }) => useGravacaoAutomatica({ valor, enviar }),
      { initialProps: { valor: "" } },
    );
    rerender({ valor: "texto" });
    await passar(ATRASO_DA_GRAVACAO + 1);
    expect(result.current.texto?.leitor).toMatch(/não chegaram ao servidor/);
    expect(result.current.texto?.longo).not.toContain("guardado");
  });

  it("com cópia local, a recusa diz «guardado só neste computador» — e a cópia foi feita", async () => {
    const local = vi.fn();
    const enviar = vi.fn(
      async (): Promise<RespostaDoEnvio> => ({ estado: "falhou", definitivo: true }),
    );
    const { result, rerender } = renderHook(
      ({ valor }) => useGravacaoAutomatica({ valor, enviar, gravarLocalmente: local }),
      { initialProps: { valor: "" } },
    );

    rerender({ valor: "texto" });
    await passar(ATRASO_DA_GRAVACAO + 1);

    expect(local).toHaveBeenCalledWith("texto");
    expect(result.current.texto?.longo).toMatch(/^guardado só neste computador/);
  });

  it("antes da primeira gravação não há indicador nenhum a mostrar", () => {
    const enviar = vi.fn(async (): Promise<RespostaDoEnvio> => ({ estado: "guardado" }));
    const { result } = renderHook(() => useGravacaoAutomatica({ valor: "x", enviar }));
    expect(result.current.estado).toBeNull();
    expect(result.current.texto).toBeNull();
  });

  it("uma cópia local que rebenta não impede o envio para o servidor", async () => {
    const local = vi.fn(() => {
      throw new Error("quota");
    });
    const enviar = vi.fn(async (): Promise<RespostaDoEnvio> => ({ estado: "guardado" }));
    const { result, rerender } = renderHook(
      ({ valor }) => useGravacaoAutomatica({ valor, enviar, gravarLocalmente: local }),
      { initialProps: { valor: "" } },
    );
    rerender({ valor: "texto" });
    await passar(ATRASO_DA_GRAVACAO + 1);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toBe("guardado");
  });
});

describe("useGravacaoAutomatica — o travão de fechar o separador", () => {
  /** Fecha o separador e diz se o navegador foi travado. */
  function fecharSeparador(): boolean {
    const evento = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(evento);
    return evento.defaultPrevented;
  }

  it("com trabalho por gravar, fechar o separador é travado", async () => {
    const { enviar } = envioManual();
    const { rerender } = renderHook(({ valor }) => useGravacaoAutomatica({ valor, enviar }), {
      initialProps: { valor: "" },
    });
    // Nada escrito ainda: nada a travar.
    expect(fecharSeparador()).toBe(false);

    await act(async () => {
      rerender({ valor: "por gravar" });
    });
    expect(fecharSeparador()).toBe(true);
  });

  it("o travão continua enquanto a gravação não tiver chegado ao servidor", async () => {
    const enviar = vi.fn(
      async (): Promise<RespostaDoEnvio> => ({ estado: "falhou", definitivo: true }),
    );
    const { result, rerender } = renderHook(
      ({ valor }) => useGravacaoAutomatica({ valor, enviar }),
      { initialProps: { valor: "" } },
    );

    rerender({ valor: "texto" });
    await passar(ATRASO_DA_GRAVACAO + 1);
    expect(result.current.porGravar).toBe(false);
    expect(result.current.estado).toBe("nao-chegou-ao-servidor");

    expect(fecharSeparador()).toBe(true);
  });

  it("com tudo guardado, fechar o separador não pergunta nada", async () => {
    const enviar = vi.fn(async (): Promise<RespostaDoEnvio> => ({ estado: "guardado" }));
    const { rerender } = renderHook(({ valor }) => useGravacaoAutomatica({ valor, enviar }), {
      initialProps: { valor: "" },
    });
    rerender({ valor: "texto" });
    await passar(ATRASO_DA_GRAVACAO + 1);

    expect(fecharSeparador()).toBe(false);
  });
});

describe("textoDaGravacao", () => {
  /**
   * HOJE, e não uma data fixa no passado.
   *
   * A barra passou a dizer o DIA quando a gravação não é de hoje — era o
   * defeito que o inventário apanhou: uma proposta reaberta no dia seguinte
   * dizia «guardado às 14:32» e parecia acabada de gravar. Uma data de agosto
   * de 2026 escrita à mão deixava de exercer o caso normal (hoje) assim que o
   * relógio passasse dela. Ver `quando-gravado`, que tem os outros dias.
   */
  const hora = (() => {
    const d = new Date();
    d.setHours(13, 32, 0, 0);
    return d;
  })();

  it("os três estados do estúdio, palavra por palavra", () => {
    expect(textoDaGravacao("a-guardar", null)).toEqual({
      curto: "…",
      longo: "a guardar…",
      leitor: "a guardar",
    });
    expect(textoDaGravacao("guardado", hora).longo).toMatch(/^guardado às \d{2}:\d{2}$/);
    const so = textoDaGravacao("nao-chegou-ao-servidor", hora, { copiaLocal: true });
    expect(so.curto).toBe("⚠ guardado só neste computador");
    expect(so.longo).toMatch(/^guardado só neste computador às \d{2}:\d{2}$/);
    expect(so.leitor).toMatch(/só neste computador/);
  });

  it("sem cópia local a palavra «guardado» não aparece — porque não está", () => {
    const t = textoDaGravacao("nao-chegou-ao-servidor", hora, { copiaLocal: false });
    expect(t.longo).not.toContain("guardado");
    expect(t.curto).not.toContain("guardado");
    expect(t.leitor).toMatch(/não chegaram ao servidor/);
  });
});

describe("enviarComRepeticao", () => {
  it("devolve à primeira quando o servidor aceita", async () => {
    const tentar = vi.fn(async (): Promise<RespostaDoEnvio> => ({ estado: "guardado" }));
    const r = await enviarComRepeticao(tentar);
    expect(r.estado).toBe("guardado");
    expect(tentar).toHaveBeenCalledTimes(1);
  });

  it("guarda o motivo da última tentativa para o ecrã o poder dizer", async () => {
    const tentar = vi.fn(
      async (): Promise<RespostaDoEnvio> => ({
        estado: "falhou",
        porque: "Sem permissões.",
        definitivo: true,
      }),
    );
    const r = await enviarComRepeticao(tentar);
    expect(r).toEqual({ estado: "nao-guardado", porque: "Sem permissões." });
  });
});

describe("respostaDeHttp", () => {
  it("2xx é guardado; 4xx é definitivo; 5xx repete-se", () => {
    expect(respostaDeHttp(200)).toEqual({ estado: "guardado" });
    expect(respostaDeHttp(401)).toMatchObject({ estado: "falhou", definitivo: true });
    expect(respostaDeHttp(500)).toMatchObject({ estado: "falhou", definitivo: false });
    expect(respostaDeHttp(503, { permanente: true })).toMatchObject({ definitivo: true });
  });
});
