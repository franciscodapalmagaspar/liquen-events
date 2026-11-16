import { describe, expect, it } from "vitest";
import { GB, TECTOS, avisosDoBlob, podeGastar, somar, usoNormalizado } from "./tectos";

const agora = new Date("2026-11-16T12:00:00Z");
const vazio = usoNormalizado(null, agora);

describe("tectos do Vercel Blob", () => {
  it("os números são os que o dono fixou", () => {
    expect(TECTOS.bytes).toEqual({ aviso: 1.5 * GB, travao: 2 * GB });
    expect(TECTOS.avancadas).toEqual({ aviso: 40_000, travao: 50_000 });
    expect(TECTOS.simples).toEqual({ aviso: 240_000, travao: 300_000 });
    expect(TECTOS.transferencia).toEqual({ aviso: 4 * GB, travao: 5 * GB });
  });

  it("muda o mês: os contadores do mês voltam a zero, os bytes guardados não", () => {
    const u = usoNormalizado(
      { mes: "2026-10", avancadas: 49_000, simples: 5, transferencia: 9, bytes: 123 },
      agora,
    );
    expect(u).toEqual({ mes: "2026-11", avancadas: 0, simples: 0, transferencia: 0, bytes: 123 });
  });

  it("lixo na linha não rebenta nem conta", () => {
    expect(usoNormalizado({ mes: "2026-11", avancadas: "x", bytes: -5 }, agora)).toEqual(vazio);
  });

  it("recusa a escrita que passaria do travão de armazenamento", () => {
    const u = { ...vazio, bytes: 2 * GB - 100 };
    expect(podeGastar(u, { avancadas: 1, bytes: 100 })).toEqual({ pode: true });
    expect(podeGastar(u, { avancadas: 1, bytes: 101 })).toEqual({
      pode: false,
      motivo: "armazenamento",
    });
  });

  it("recusa a 50 001.ª operação avançada do mês", () => {
    const u = { ...vazio, avancadas: 50_000 };
    expect(podeGastar(u, { avancadas: 1 })).toEqual({ pode: false, motivo: "operacoes-avancadas" });
  });

  it("recusa leituras acima das 300 000 simples ou dos 5 GB transferidos", () => {
    expect(podeGastar({ ...vazio, simples: 300_000 }, { simples: 1 })).toEqual({
      pode: false,
      motivo: "operacoes-simples",
    });
    expect(
      podeGastar({ ...vazio, transferencia: 5 * GB }, { simples: 1, transferencia: 1 }),
    ).toEqual({
      pode: false,
      motivo: "transferencia",
    });
  });

  it("só trava o que a operação toca: apagar passa sempre, ler não olha para o espaço", () => {
    const cheio = { ...vazio, bytes: 3 * GB, avancadas: 60_000 };
    expect(podeGastar(cheio, { bytes: -500 })).toEqual({ pode: true });
    expect(podeGastar(cheio, { simples: 1, transferencia: 10 })).toEqual({ pode: true });
  });

  it("somar nunca deixa os bytes guardados negativos", () => {
    expect(somar({ ...vazio, bytes: 10 }, { bytes: -50 }).bytes).toBe(0);
  });

  it("sem aviso abaixo dos limiares — um aviso que aparece sempre deixa de ser lido", () => {
    expect(avisosDoBlob({ ...vazio, bytes: 1.4 * GB, avancadas: 39_999 })).toEqual([]);
  });

  it("avisa a partir de 1,5 GB / 40 000 / 240 000 / 4 GB, e diz quando parou", () => {
    const a = avisosDoBlob({
      mes: "2026-11",
      bytes: 1.5 * GB,
      avancadas: 50_000,
      simples: 240_000,
      transferencia: 4 * GB,
    });
    expect(a).toHaveLength(4);
    expect(a[0]).toMatch(/guardado.*perto do tecto/);
    expect(a[1]).toMatch(/parado: as escritas vão para o Supabase/);
    expect(a[2]).toMatch(/leituras/);
    expect(a[3]).toMatch(/transferido/);
  });
});
