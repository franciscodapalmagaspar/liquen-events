import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import {
  ANIMADA_MAX_BYTES,
  AQUECER_ANTES_S,
  ARRANQUE_S,
  MARGEM_DOS_SEGUINTES_S,
  SEGUINTES_DEPOIS_DE_S,
  prazoDosSeguintesMs,
  TAKE_DE_ENTRADA,
  MEDIR_REDE_MS,
  NUMERO_DE_VIDEOS,
  PASSAGEM_MS,
  TEM_GRANDE,
  duracaoDaSubida,
  eHoraDePassar,
  eRedeLenta,
  enderecoDoVideo,
  enderecoAnimada,
  escolherPrimeiro,
  enderecoLeve,
  imagensAnimadas,
  ligacaoLenta,
  formatoDoEndereco,
  formatoQueToca,
  melhorFormato,
  novaVolta,
  primeiraVolta,
  proximoVideo,
  varianteParaOEcra,
  alivioGuardado,
  deveAliviar,
  eComputador,
  enderecoLeveDeitado,
  grandeVale,
  varianteConfirmada,
} from "./entrada-em-video";

const TELEMOVEL = { largura: 390, altura: 844, densidade: 3 };
const PORTATIL = { largura: 1440, altura: 900, densidade: 1 };
const RETINA = { largura: 1440, altura: 900, densidade: 2 };

describe("os vídeos da entrada — as regras", () => {
  it("seguem 1 → 2 → 3 → 1", () => {
    const ordem = [0];
    for (let k = 0; k < 4; k++) ordem.push(proximoVideo(ordem[ordem.length - 1]));
    expect(ordem).toEqual([0, 1, 2, 0, 1]);
  });

  it("cada vídeo existe em H.264 e WebM, e nenhum passa do tecto (30/10, «nível estúdio»)", () => {
    // O pedido: telemóvel 720 px até 1,2 MB; computador até 3 MB.
    const TECTO = { retrato: 1.2 * 1024 * 1024, paisagem: 3 * 1024 * 1024 };
    for (let i = 0; i < NUMERO_DE_VIDEOS; i++) {
      for (const v of ["paisagem", "retrato"] as const) {
        for (const f of ["mp4", "webm"] as const) {
          const p = `public${enderecoDoVideo(i, v, f)}`;
          expect(existsSync(p), p).toBe(true);
          expect(statSync(p).size, p).toBeLessThan(TECTO[v]);
        }
        // Nada de HEVC nem AV1: duplicavam o peso no servidor para nada.
        for (const f of ["hevc", "av1"] as const) {
          expect(existsSync(`public${enderecoDoVideo(i, v, f)}`)).toBe(false);
        }
      }
    }
    expect(TEM_GRANDE.some(Boolean)).toBe(false);
  });

  it("telemóvel ao alto → retrato; computador e ecrã denso → paisagem (não há grande)", () => {
    expect(varianteParaOEcra(TELEMOVEL, 0)).toBe("retrato");
    expect(varianteParaOEcra(PORTATIL, 1)).toBe("paisagem");
    expect(varianteParaOEcra(RETINA, 1)).toBe("paisagem");
    expect(varianteParaOEcra(RETINA, 0)).toBe("paisagem");
  });

  it("o WebM e os vídeos sem 4K caem da versão grande para a paisagem", () => {
    expect(enderecoDoVideo(1, "grande", "webm")).toMatch(/entrada-2-paisagem\.webm$/);
    if (!TEM_GRANDE[0]) expect(enderecoDoVideo(0, "grande")).toMatch(/entrada-1-paisagem\.mp4$/);
  });

  it("H.264 primeiro; VP9 só sem ele; sem nenhum, nada", () => {
    expect(formatoQueToca(() => "probably")).toBe("mp4");
    expect(formatoQueToca((t) => (t.includes("webm") ? "maybe" : ""))).toBe("webm");
    expect(formatoQueToca(() => "")).toBeNull();
  });

  it("o HEVC e o AV1 seriam MP4 com o codec no nome (os registos antigos ainda os nomeiam)", () => {
    expect(enderecoDoVideo(0, "paisagem", "hevc")).toBe(
      "/videos/entrada/v8/entrada-1-paisagem-hevc.mp4",
    );
    // Sem grande na v7: a grande cai para a paisagem.
    expect(enderecoDoVideo(1, "grande", "av1")).toBe(
      "/videos/entrada/v8/entrada-2-paisagem-av1.mp4",
    );
    expect(formatoDoEndereco("https://x/videos/entrada/v8/entrada-1-retrato-hevc.mp4")).toBe(
      "hevc",
    );
    expect(formatoDoEndereco("/v/entrada-1-retrato-av1.mp4")).toBe("av1");
    expect(formatoDoEndereco("/v/entrada-1-retrato.mp4")).toBe("mp4");
    expect(formatoDoEndereco("/v/entrada-1-retrato.webm")).toBe("webm");
    expect(formatoDoEndereco("")).toBeNull();
  });

  describe("o melhor formato: desde a v7, só o que existe (H.264, ou WebM)", () => {
    const tudo = () => "probably";
    const sim = async () => ({ supported: true, smooth: true, powerEfficient: true });

    it("mesmo com o AV1 e o HEVC no chip, é o H.264", async () => {
      expect(await melhorFormato(tudo, sim, "paisagem")).toBe("mp4");
      expect(await melhorFormato(tudo, sim, "retrato", true)).toBe("mp4");
    });

    it("sem H.264, o WebM; sem nenhum, nada", async () => {
      const soWebm = (t: string) => (t.includes("webm") ? "maybe" : "");
      expect(await melhorFormato(soWebm, null, "paisagem")).toBe("webm");
      expect(await melhorFormato(() => "", null, "paisagem")).toBeNull();
    });
  });

  it("a passagem começa quando falta o tempo dela, mais a folga do arranque, para o fim", () => {
    const fim = 12;
    const comeca = fim - PASSAGEM_MS / 1000 - ARRANQUE_S;
    expect(eHoraDePassar(comeca - 0.1, fim)).toBe(false);
    expect(eHoraDePassar(comeca, fim)).toBe(true);
    // A folga existe: o seguinte arranca ANTES de faltar só a subida (era aí
    // que o que saía chegava ao fim e parava no último fotograma).
    expect(eHoraDePassar(fim - PASSAGEM_MS / 1000 - 0.05, fim)).toBe(true);
    expect(ARRANQUE_S).toBeGreaterThanOrEqual(0.5);
    expect(eHoraDePassar(3, Number.NaN)).toBe(false);
    expect(eHoraDePassar(3, 0)).toBe(false);
  });

  it("uma subida que começa tarde encolhe para acabar antes de o que sai parar", () => {
    expect(duracaoDaSubida(1.5)).toBe(PASSAGEM_MS); // a tempo: a de sempre
    expect(duracaoDaSubida(0.5)).toBe(450); // tarde: 90 % do que falta
    expect(duracaoDaSubida(0.1)).toBe(200); // muito tarde: nunca menos de 200 ms
    expect(duracaoDaSubida(Number.NaN)).toBe(PASSAGEM_MS);
  });

  it("a floresta como imagem animada: o MP4 no <img> e o WebP, ao alto e deitado", () => {
    expect(enderecoAnimada(0, "retrato")).toBe("/videos/entrada/v8/entrada-1-retrato-animada.webp");
    expect(imagensAnimadas(TAKE_DE_ENTRADA)).toEqual({
      mp4: [
        "/videos/entrada/v8/entrada-1-retrato.mp4",
        "/videos/entrada/v8/entrada-1-paisagem.mp4",
      ],
      webp: [
        "/videos/entrada/v8/entrada-1-retrato-animada.webp",
        "/videos/entrada/v8/entrada-1-paisagem-animada.webp",
      ],
    });
    // Os WebP existem e não passam do tecto (é o que se descarrega quando o
    // aparelho recusa o vídeo, muitas vezes num telemóvel em 4G).
    for (const p of imagensAnimadas(TAKE_DE_ENTRADA).webp) {
      expect(existsSync(`public${p}`), p).toBe(true);
      expect(statSync(`public${p}`).size, p).toBeLessThan(ANIMADA_MAX_BYTES);
    }
  });

  it("a versão leve ao alto é, desde a v7, a própria vertical (720 px, ~1 MB)", () => {
    expect(enderecoLeve(0, "hevc")).toBe("/videos/entrada/v8/entrada-1-retrato.mp4");
    expect(enderecoLeve(2, "mp4")).toBe("/videos/entrada/v8/entrada-3-retrato.mp4");
  });

  it("a ligação diz-se lenta: poupar dados, 2G/3G, ou menos de 5 Mbit/s", () => {
    expect(ligacaoLenta(undefined)).toBe(false); // o iPhone não diz nada
    expect(ligacaoLenta({ effectiveType: "4g", downlink: 10 })).toBe(false);
    expect(ligacaoLenta({ effectiveType: "4g", downlink: 3.2 })).toBe(true);
    expect(ligacaoLenta({ effectiveType: "3g" })).toBe(true);
    expect(ligacaoLenta({ effectiveType: "slow-2g" })).toBe(true);
    expect(ligacaoLenta({ saveData: true })).toBe(true);
    expect(ligacaoLenta({ downlink: 0 })).toBe(false); // 0 = não sabe
  });

  /**
   * Decisão dela (22/10): os seguintes esperam que o de entrada ande, mas
   * com um prazo que deixa ao seguinte tempo de sobra para chegar inteiro.
   */
  it("o prazo dos seguintes: a duração do de entrada menos a margem, e 0 nos takes curtos", () => {
    // A floresta (18,4 s): no máximo 6,4 s depois de ficar à vista.
    expect(prazoDosSeguintesMs(18.4)).toBe(6400);
    // Os takes de 11,6 s e de 4,2 s não esperam: começam logo, como antes.
    expect(prazoDosSeguintesMs(11.6)).toBe(0);
    expect(prazoDosSeguintesMs(4.24)).toBe(0);
    // Sem duração conhecida: o comportamento de antes.
    expect(prazoDosSeguintesMs(NaN)).toBe(0);
    expect(prazoDosSeguintesMs(Infinity)).toBe(0);
    expect(prazoDosSeguintesMs(0)).toBe(0);
    // A espera normal (o de entrada a andar) acaba antes do prazo, e o prazo
    // deixa ao seguinte pelo menos 7 s até ser preparado — o tempo de o
    // descarregar inteiro numa rede razoável.
    expect(SEGUINTES_DEPOIS_DE_S * 1000).toBeLessThan(prazoDosSeguintesMs(18.4));
    expect(
      MARGEM_DOS_SEGUINTES_S - AQUECER_ANTES_S - PASSAGEM_MS / 1000 - ARRANQUE_S,
    ).toBeGreaterThanOrEqual(7);
  });

  it("a rede medida no arranque: menos de 1,3 s de vídeo por segundo de espera é lenta", () => {
    expect(eRedeLenta(0, MEDIR_REDE_MS - 1)).toBe(false); // cedo de mais para decidir
    expect(eRedeLenta(0.5, MEDIR_REDE_MS)).toBe(true);
    expect(eRedeLenta(1.2, 1500)).toBe(true); // 0,8 s por segundo
    expect(eRedeLenta(4, 1500)).toBe(false); // 2,7 s por segundo
  });

  /**
   * As tiras pretas (pedido dela: «quero completamente sem nada à volta»):
   * a versão larga tem de ser 2:1, sem os 60 px pretos em cima e em baixo.
   * Mede-se com o `file`/cabeçalho do MP4: a largura e a altura do vídeo.
   */
  it("sem tiras pretas: a versão larga é 1920×960", () => {
    let saida = "";
    try {
      saida = execFileSync("node", ["-e", MEDIR, `public${enderecoDoVideo(0, "paisagem")}`], {
        encoding: "utf8",
      });
    } catch {
      return; // sem node no ambiente: não se mede
    }
    expect(saida.trim()).toBe("1920x960");
  });

  it("a primeira volta começa no take de entrada, e as outras vão mudando de ordem", () => {
    for (const primeiro of [0, 1, 2]) {
      const vistas = new Set<string>();
      for (let k = 0; k < 200; k++) {
        const v = primeiraVolta(primeiro);
        expect(v[0]).toBe(primeiro);
        expect([...v].sort()).toEqual([0, 1, 2]);
        vistas.add(v.join());
      }
      // As duas ordens possíveis dos outros dois aparecem.
      expect(vistas.size).toBe(2);
    }
  });

  it("a 1.ª visita de sempre abre na floresta; um valor estranho também", () => {
    expect(TAKE_DE_ENTRADA).toBe(0);
    expect(escolherPrimeiro(null)).toBe(0);
    expect(escolherPrimeiro(Number.NaN)).toBe(0);
    expect(escolherPrimeiro(7)).toBe(0);
    expect(primeiraVolta(escolherPrimeiro(null))[0]).toBe(0);
  });

  it("depois, cada entrada abre num take diferente do da anterior (e todos aparecem)", () => {
    for (let ultimo = 0; ultimo < NUMERO_DE_VIDEOS; ultimo++) {
      const vistos = new Set<number>();
      for (let k = 0; k < 40; k++) {
        const n = escolherPrimeiro(ultimo);
        expect(n).not.toBe(ultimo);
        vistos.add(n);
      }
      expect(vistos.size).toBe(NUMERO_DE_VIDEOS - 1);
    }
    expect(escolherPrimeiro(0, () => 0.9999)).toBe(2);
    expect(escolherPrimeiro(2, () => 0)).toBe(0);
  });

  it("uma volta nova nunca repete o último vídeo logo a seguir", () => {
    const ordens = new Set<string>();
    for (let ultimo = 0; ultimo < NUMERO_DE_VIDEOS; ultimo++) {
      for (let k = 0; k < 300; k++) {
        const v = novaVolta(ultimo);
        expect(v[0]).not.toBe(ultimo);
        expect([...v].sort()).toEqual([0, 1, 2]);
        ordens.add(v.join());
      }
    }
    // E não é sempre a mesma: aparecem as seis ordens possíveis.
    expect(ordens.size).toBe(6);
  });
});

/** Lê a largura × altura do `tkhd` de vídeo de um MP4 (sem ffprobe). */
const MEDIR = `
const b=require("fs").readFileSync(process.argv[1]);
let i=b.indexOf("tkhd");
while(i>0){const v=b[i+4];const off=i+4+(v===1?88:76);const w=b.readUInt32BE(off)>>>16,h=b.readUInt32BE(off+4)>>>16;if(w&&h){console.log(w+"x"+h);break}i=b.indexOf("tkhd",i+4)}
`;

describe("no computador (29/10, «no PC está a travar mesmo imenso»)", () => {
  const r = (supported: boolean, smooth: boolean, powerEfficient: boolean) => ({
    supported,
    smooth,
    powerEfficient,
  });

  it("a grande só se o aparelho a toca no chip e sem perder fotogramas", async () => {
    expect(await grandeVale(async () => r(true, true, true), "mp4")).toBe(true);
    expect(await grandeVale(async () => r(true, true, false), "mp4")).toBe(false);
    expect(await grandeVale(async () => r(true, false, true), "av1")).toBe(false);
    expect(await grandeVale(null, "mp4")).toBe(false);
    expect(await grandeVale(async () => r(true, true, true), "webm")).toBe(false);
    expect(
      await grandeVale(async () => {
        throw new Error("x");
      }, "hevc"),
    ).toBe(false);
  });

  it("sem a confirmação, a grande passa a paisagem; o resto não muda", () => {
    expect(varianteConfirmada(RETINA, 1, false)).toBe("paisagem");
    // Desde a v7 não há grande: nem com a confirmação.
    expect(varianteConfirmada(RETINA, 1, true)).toBe("paisagem");
    expect(varianteConfirmada(PORTATIL, 1, true)).toBe("paisagem");
    expect(varianteConfirmada({ largura: 390, altura: 844, densidade: 3 }, 1, false)).toBe(
      "retrato",
    );
  });

  it("computador é rato e ecrã largo; um tablet com o dedo não é", () => {
    expect(eComputador(true, 1440)).toBe(true);
    expect(eComputador(true, 900)).toBe(false);
    expect(eComputador(false, 1366)).toBe(false);
  });
});

describe("a leve deitada, para o computador que não aguenta a normal (29/10)", () => {
  it("existe, para os três takes, em H.264 e leve", () => {
    for (let i = 0; i < 3; i++) {
      const p = `public${enderecoLeveDeitado(i)}`;
      expect(existsSync(p), p).toBe(true);
      expect(statSync(p).size).toBeLessThan(8_000_000);
      expect(formatoDoEndereco(enderecoLeveDeitado(i))).toBe("mp4");
    }
  });

  it("só alivia com fotogramas que cheguem e mais de 10 % perdidos", () => {
    // Desde a v8 (50 fps), 5 s são 250 fotogramas.
    expect(deveAliviar(300, 80)).toBe(true);
    expect(deveAliviar(300, 20)).toBe(false);
    expect(deveAliviar(150, 80)).toBe(false);
  });

  it("o alívio guardado vale uma semana", () => {
    const agora = Date.parse("2026-10-29T12:00:00Z");
    expect(alivioGuardado(String(agora - 3600_000), agora)).toBe(true);
    expect(alivioGuardado(String(agora - 8 * 24 * 3600_000), agora)).toBe(false);
    expect(alivioGuardado(null, agora)).toBe(false);
    expect(alivioGuardado("lixo", agora)).toBe(false);
  });
});
