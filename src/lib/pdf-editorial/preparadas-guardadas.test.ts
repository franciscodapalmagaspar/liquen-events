import { createHash } from "node:crypto";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardadas = new Map<string, Buffer>();
const ler = vi.fn(async (ref: string, receita: string) => guardadas.get(`${receita}|${ref}`) ?? null);
const guardar = vi.fn(async (ref: string, receita: string, b: Buffer) => {
  guardadas.set(`${receita}|${ref}`, b);
});
vi.mock("@/lib/fotos-editoriais-guardadas", () => ({
  lerFotoEditorialGuardada: (ref: string, receita: string) => ler(ref, receita),
  guardarFotoEditorial: (ref: string, receita: string, b: Buffer) => guardar(ref, receita, b),
}));

const { preparar, BRILHO } = await import("./imagens");
const { prepararGuardado, esquecerPreparadas, VERSAO_DO_TRATAMENTO } = await import(
  "./preparadas-guardadas"
);

/** Uma fotografia de referência: um degradé com cor, sempre igual. */
async function referencia(): Promise<Buffer> {
  const w = 320;
  const h = 200;
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      px[i] = (x * 255) / w;
      px[i + 1] = (y * 255) / h;
      px[i + 2] = ((x + y) * 255) / (w + h);
    }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

const TRATAMENTO = { arrastado: { angulo: -14 }, brilho: BRILHO.texto, saturacao: 0.6 };

beforeEach(() => {
  guardadas.clear();
  ler.mockClear();
  guardar.mockClear();
  esquecerPreparadas();
});

describe("prepararGuardado — a fotografia tratada não se refaz (3/11)", () => {
  it("dá exactamente os mesmos bytes que o preparar", async () => {
    const foto = await referencia();
    const directo = await preparar(foto, 300, 180, 300, TRATAMENTO);
    const guardado = await prepararGuardado(foto, 300, 180, 300, TRATAMENTO);
    expect(guardado).not.toBeNull();
    expect(Buffer.compare(guardado!, directo!)).toBe(0);
    expect(guardar).toHaveBeenCalledTimes(1);
  });

  it("a segunda vez sai da memória, sem ir ao armazenamento", async () => {
    const foto = await referencia();
    const a = await prepararGuardado(foto, 300, 180, 300, TRATAMENTO);
    ler.mockClear();
    const b = await prepararGuardado(foto, 300, 180, 300, TRATAMENTO);
    expect(b).toBe(a);
    expect(ler).not.toHaveBeenCalled();
  });

  it("uma instância nova (memória vazia) usa a guardada e não refaz", async () => {
    const foto = await referencia();
    const a = await prepararGuardado(foto, 300, 180, 300, TRATAMENTO);
    esquecerPreparadas();
    guardar.mockClear();
    ler.mockClear();
    const b = await prepararGuardado(foto, 300, 180, 300, TRATAMENTO);
    expect(Buffer.compare(a!, b!)).toBe(0);
    expect(ler).toHaveBeenCalledTimes(1);
    expect(guardar).not.toHaveBeenCalled();
  });

  it("outra caixa ou outro tratamento é outra imagem", async () => {
    const foto = await referencia();
    await prepararGuardado(foto, 300, 180, 300, TRATAMENTO);
    await prepararGuardado(foto, 300, 200, 300, TRATAMENTO);
    await prepararGuardado(foto, 300, 180, 300, { ...TRATAMENTO, brilho: 0.8 });
    expect(guardar).toHaveBeenCalledTimes(3);
  });

  /**
   * O resultado do `preparar` para a fotografia de referência. Se este teste
   * falhar, o tratamento mudou: o PDF sai diferente do que está guardado, e a
   * {@link VERSAO_DO_TRATAMENTO} tem de mudar (`preparar-v1` → `preparar-v2`)
   * para nunca se servir uma imagem tratada à moda antiga. Depois, actualiza o
   * resumo aqui.
   */
  it(`o tratamento é o mesmo que a versão ${VERSAO_DO_TRATAMENTO} guardou`, async () => {
    const foto = await referencia();
    const jpeg = await preparar(foto, 300, 180, 300, TRATAMENTO);
    const resumo = createHash("sha256").update(jpeg!).digest("hex").slice(0, 16);
    expect(VERSAO_DO_TRATAMENTO).toBe("preparar-v1");
    expect(resumo).toBe("84dc1c252f488b99");
  });
});
