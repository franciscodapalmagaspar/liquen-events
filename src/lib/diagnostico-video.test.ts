import { describe, expect, it } from "vitest";
import {
  ACONTECIMENTOS_ANTES,
  DIAGNOSTICO_ATE,
  ENVIO_DEPOIS_MS,
  MAX_ENVIOS,
  PARAGEM_MS,
  PARAGEM_SEM_FOTOGRAMAS_MS,
  RegistoDoVideo,
  aparelho,
  chaveDoDiagnostico,
  diagnosticoLigado,
  formatoDoSrc,
  novaSessao,
  type EstadoDoVideo,
} from "./diagnostico-video";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0 (iPhone15,2; iOS 17_6_1; pt_PT; pt; scale=3.00; 1179x2556; 123456789)";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const ESTADO: EstadoDoVideo = {
  take: 1,
  ct: 4.123456,
  dur: 18.4,
  rs: 2,
  ns: 1,
  paused: false,
  ended: false,
  fonte: "blob",
  formato: "hevc",
  leve: false,
  aPassar: false,
  aFrente: 0.25,
};

function montar(fotogramasFinos = true) {
  let t = 1000;
  const enviados: string[] = [];
  const agendados: Array<{ ms: number; fn: () => void }> = [];
  const r = new RegistoDoVideo({
    agora: () => t,
    enviar: (c) => void enviados.push(c),
    depois: (ms, fn) => void agendados.push({ ms, fn }),
    aparelho: aparelho(IPHONE_SAFARI, { largura: 390, altura: 844, densidade: 3 }, "4g"),
    sessao: "abcdefgh1234",
    fotogramasFinos,
  });
  return {
    r,
    enviados,
    agendados,
    avancar: (ms: number) => void (t += ms),
  };
}

describe("o registo anónimo do vídeo", () => {
  it("o aparelho fica reduzido à versão do iOS e ao browser — o user agent inteiro não sai", () => {
    const a = aparelho(IPHONE_INSTAGRAM, { largura: 390, altura: 844, densidade: 3 }, "4g");
    expect(a).toEqual({
      ios: "17.6",
      nav: "instagram",
      movel: true,
      ecra: "390x844@3",
      alto: true,
      ligacao: "4g",
    });
    expect(JSON.stringify(a)).not.toMatch(/Mozilla|AppleWebKit|iPhone15|1179x2556|123456789/);
    expect(aparelho(IPHONE_SAFARI, { largura: 844, altura: 390, densidade: 3 }).nav).toBe("safari");
    expect(aparelho(CHROME_MAC, { largura: 1440, altura: 900, densidade: 2 })).toMatchObject({
      ios: null,
      nav: "chrome",
      movel: false,
      alto: false,
      ligacao: null,
    });
  });

  it("uma paragem: mais de 300 ms sem fotograma, com o estado e o que veio antes", () => {
    const { r, avancar } = montar();
    r.fotograma();
    r.acontecimento("passar", 2);
    r.acontecimento("waiting", 1);
    avancar(PARAGEM_MS - 10);
    r.verificar(true, () => ESTADO);
    expect(r.corpo("saida").paragens).toHaveLength(0);
    avancar(60);
    r.verificar(true, () => ESTADO);
    avancar(400);
    r.fotograma(); // voltou a andar
    const [p] = r.corpo("saida").paragens;
    expect(p.inicio).toBe(0);
    expect(p.ms).toBe(PARAGEM_MS - 10 + 60 + 400);
    expect(p.estado).toMatchObject({ take: 1, ct: 4.12, fonte: "blob", formato: "hevc" });
    expect(p.antes.map((x) => x.k)).toEqual(["passar", "waiting"]);
    expect(r.corpo("saida").contadores).toMatchObject({ paragem: 1, passar: 1, waiting: 1 });
  });

  it("guarda só os últimos acontecimentos antes da paragem", () => {
    const { r, avancar } = montar();
    r.fotograma();
    for (let k = 0; k < 30; k++) r.acontecimento("aquecer", k % 3);
    avancar(PARAGEM_MS + 50);
    r.verificar(true, () => ESTADO);
    expect(r.corpo("saida").paragens[0].antes).toHaveLength(ACONTECIMENTOS_ANTES);
  });

  it("o que não devia andar (separador escondido, à espera de um toque) não conta como paragem", () => {
    const { r, avancar } = montar();
    r.fotograma();
    avancar(5000);
    r.verificar(false, () => ESTADO);
    r.verificar(true, () => ESTADO); // recomeça a contar daqui
    expect(r.corpo("saida").paragens).toHaveLength(0);
  });

  it("sem fotogramas finos (só o timeupdate), o limite é mais largo", () => {
    const { r, avancar } = montar(false);
    r.fotograma();
    avancar(PARAGEM_MS + 100);
    r.verificar(true, () => ESTADO);
    expect(r.corpo("saida").paragens).toHaveLength(0);
    avancar(PARAGEM_SEM_FOTOGRAMAS_MS);
    r.verificar(true, () => ESTADO);
    expect(r.corpo("saida").paragens).toHaveLength(1);
  });

  it("envia 3 s depois de uma paragem acabar, e nunca mais do que 12 vezes por página", () => {
    const { r, enviados, agendados, avancar } = montar();
    r.fotograma();
    avancar(500);
    r.verificar(true, () => ESTADO);
    r.fotograma();
    expect(agendados).toHaveLength(1);
    expect(agendados[0].ms).toBe(ENVIO_DEPOIS_MS);
    agendados[0].fn();
    const corpo = JSON.parse(enviados[0]);
    expect(corpo).toMatchObject({ v: 1, sessao: "abcdefgh1234", motivo: "paragem" });
    expect(corpo.paragens).toHaveLength(1);
    for (let k = 0; k < 20; k++) r.enviar("saida");
    expect(enviados).toHaveLength(MAX_ENVIOS);
  });

  it("desliga-se sozinho no fim do prazo", () => {
    expect(diagnosticoLigado(Date.parse("2026-10-16T12:00:00Z"))).toBe(true);
    expect(diagnosticoLigado(Date.parse(`${DIAGNOSTICO_ATE}T00:00:00Z`))).toBe(false);
  });

  it("a sessão é ao acaso e curta, e a chave junta o dia e a sessão", () => {
    expect(novaSessao()).toMatch(/^[a-z0-9]{12}$/);
    expect(novaSessao()).not.toBe(novaSessao());
    expect(chaveDoDiagnostico("abcdefgh1234", new Date("2026-10-16T20:00:00Z"))).toBe(
      "diagnostico-video:2026-10-16:abcdefgh1234",
    );
  });

  it("o formato pelo endereço", () => {
    expect(formatoDoSrc("/videos/entrada/v7/entrada-1-retrato-hevc.mp4")).toBe("hevc");
    expect(formatoDoSrc("/videos/entrada/v7/entrada-2-paisagem.mp4")).toBe("mp4");
    expect(formatoDoSrc("/videos/entrada/v7/entrada-2-paisagem.webm")).toBe("webm");
    expect(formatoDoSrc("blob:https://x/1")).toBe("blob");
    expect(formatoDoSrc("")).toBeNull();
  });
});
