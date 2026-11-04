import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * A rota do registo anónimo do vídeo é PÚBLICA: o corpo é escrito por quem
 * quiser. Estes testes prendem o que a protege — o esquema fechado, o tecto de
 * tamanho, o ritmo e o prazo — e onde grava.
 */
const rl = vi.hoisted(() => ({ ok: true }));
const estado = vi.hoisted(() => ({ setState: vi.fn(async () => ({ gravado: true })) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => rl),
  clientIp: () => "test-ip",
  sweep: () => {},
}));
vi.mock("@/lib/app-state", () => estado);

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POST } from "./route";
import { RegistoDoVideo, aparelho, type EstadoDoVideo } from "@/lib/diagnostico-video";

function post(corpo: unknown): NextRequest {
  return new Request("https://liquen.test/api/diagnostico-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  }) as unknown as NextRequest;
}

const CORPO = {
  v: 1,
  sessao: "abcdefgh1234",
  motivo: "paragem",
  aparelho: {
    ios: "18.1",
    nav: "safari",
    movel: true,
    ecra: "390x844@3",
    alto: true,
    ligacao: "4g",
  },
  desde: 25000,
  paragens: [
    {
      inicio: 19800,
      ms: 450,
      estado: {
        take: 0,
        ct: 18.4,
        dur: 18.4,
        rs: 4,
        ns: 1,
        paused: false,
        ended: false,
        fonte: "rede",
        formato: "hevc",
        leve: false,
        aPassar: true,
        aFrente: 0,
      },
      antes: [{ t: 18000, k: "passar", v: 1 }],
    },
  ],
  contadores: { paragem: 1, passar: 1 },
  qualidade: null,
};

beforeEach(() => {
  rl.ok = true;
  vi.clearAllMocks();
  vi.useRealTimers();
  // O registo desligou-se a 4/11 (`DIAGNOSTICO_ATE`). O que se prova aqui é
  // como a rota se porta enquanto está ligado: o relógio fica dentro do prazo.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
});

describe("POST /api/diagnostico-video", () => {
  it("grava a página na sua chave (dia e sessão), e não devolve nada", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T20:10:00Z"));
    const res = await POST(post(CORPO));
    expect(res.status).toBe(204);
    expect(estado.setState).toHaveBeenCalledTimes(1);
    const [chave, valor] = estado.setState.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(chave).toBe("diagnostico-video:2026-10-16:abcdefgh1234");
    expect(valor).toMatchObject({ sessao: "abcdefgh1234", recebidoEm: "2026-10-16T20:10:00.000Z" });
    // O IP não é guardado.
    expect(JSON.stringify(valor)).not.toContain("test-ip");
  });

  it("aceita um registo VERDADEIRO, tal como o browser o manda (apanhado no Chromium)", async () => {
    // Sem isto, um campo a mais no browser faria o esquema recusar tudo em
    // silêncio (a rota responde 204 mesmo assim) — e não chegava nada.
    const real = {
      v: 1,
      sessao: "2qbywkee9bcv",
      motivo: "saida",
      aparelho: {
        ios: "18.1",
        nav: "safari",
        movel: true,
        ecra: "390x844@3",
        alto: true,
        ligacao: "4g",
      },
      desde: 11756,
      paragens: [
        {
          inicio: 5455,
          ms: 1050,
          estado: {
            take: 0,
            ct: 4.17,
            dur: 18.4,
            rs: 4,
            ns: 1,
            paused: false,
            ended: false,
            fonte: "source",
            formato: "webm",
            leve: false,
            aPassar: false,
            aFrente: 14.23,
          },
          antes: [{ t: 1308, k: "playing", v: 0 }],
        },
      ],
      contadores: { playing: 1, paragem: 1 },
      qualidade: { perdidos: 1, total: 245 },
    };
    await POST(post(real));
    expect(estado.setState).toHaveBeenCalledTimes(1);
  });

  it("recusa (em silêncio) o que não está no esquema: campos a mais, texto livre", async () => {
    for (const mau of [
      { ...CORPO, ua: "Mozilla/5.0 (iPhone…)" },
      { ...CORPO, sessao: "../../etc" },
      { ...CORPO, aparelho: { ...CORPO.aparelho, nav: "o meu browser" } },
      { ...CORPO, paragens: [{ ...CORPO.paragens[0], antes: [{ t: 1, k: "<script>" }] }] },
      "isto não é JSON",
    ]) {
      const res = await POST(post(mau));
      expect(res.status).toBe(204);
    }
    expect(estado.setState).not.toHaveBeenCalled();
  });

  it("um corpo maior do que 8 KB não se lê", async () => {
    const res = await POST(post({ ...CORPO, lixo: "x".repeat(9000) }));
    expect(res.status).toBe(204);
    expect(estado.setState).not.toHaveBeenCalled();
  });

  it("com o ritmo esgotado não grava", async () => {
    rl.ok = false;
    await POST(post(CORPO));
    expect(estado.setState).not.toHaveBeenCalled();
  });

  it("depois do prazo, desliga-se", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    await POST(post(CORPO));
    expect(estado.setState).not.toHaveBeenCalled();
  });

  /**
   * 3/11: as visitas com o vídeo a travar deixaram de chegar. Duas razões, as
   * duas caladas (a rota devolve 204 e não grava): um nome de acontecimento
   * que a rota não aceita («paragem-com-dados» tem 17 letras; «aliviar-2» tem
   * um algarismo), e um corpo com muitas paragens maior do que 8 KB.
   */
  it("o pior registo que o browser faz (20 paragens, nomes do motor) é aceite", async () => {
    let t = 0;
    let enviado = "";
    const r = new RegistoDoVideo({
      agora: () => t,
      enviar: (c) => void (enviado = c),
      depois: () => {},
      aparelho: aparelho(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        { largura: 2195, altura: 1235, densidade: 1.75 },
        "4g",
      ),
      sessao: "abcdefgh1234",
      fotogramasFinos: true,
    });
    const estadoDoVideo: EstadoDoVideo = {
      take: 2,
      ct: 3.4567,
      dur: 9.94,
      rs: 2,
      ns: 2,
      paused: false,
      ended: false,
      fonte: "rede",
      formato: "mp4",
      leve: false,
      aPassar: false,
      aFrente: 0.123,
    };
    const nomes = ["paragem-com-dados", "aliviar-2", "destravar-passar", "waiting", "playing"];
    for (let i = 0; i < 30; i++) {
      for (const k of nomes) r.acontecimento(k, 2);
      r.verificar(true, () => estadoDoVideo); // começa a contar
      t += 5000;
      r.verificar(true, () => estadoDoVideo); // abre uma paragem
      t += 900;
      r.fotograma(); // fecha-a
      t += 100;
    }
    r.medirQualidade(9, 4400);
    r.enviar("saida");
    expect(enviado.length).toBeLessThanOrEqual(8 * 1024);
    expect(JSON.parse(enviado).paragens.length).toBeGreaterThan(5);
    await POST(post(enviado));
    expect(estado.setState).toHaveBeenCalledTimes(1);
  });

  it("todos os nomes que o motor marca cabem no esquema da rota", () => {
    const motor = readFileSync(join(process.cwd(), "src/components/EntradaEmVideo.tsx"), "utf8");
    const nomes = [...motor.matchAll(/marcar\((?:"([^"]+)"|`([^`]+)`)/g)].map((m) =>
      (m[1] ?? m[2]).replace(/\$\{motivo\}/, "perdidos"),
    );
    expect(nomes.length).toBeGreaterThan(5);
    for (const k of nomes) expect(k, k).toMatch(/^[a-z-]{1,16}$/);
  });
});
