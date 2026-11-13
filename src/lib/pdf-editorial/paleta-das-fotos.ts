import "server-only";
import sharp from "sharp";
import { LADO, escolher, pontosDaFoto, type Ponto } from "@/lib/paleta-cores";

/**
 * As cinco cores da página «Paleta e ambiente», a partir dos BYTES das
 * fotografias — o lado do servidor (PDF e proposta online). A regra inteira
 * está em `lib/paleta-cores.ts`, partilhada com o «Fazer proposta».
 */
/** As cores, em `#RRGGBB`, da mais clara para a mais escura. Vazio se não houver fotos. */
export async function paletaDasFotos(fotos: readonly Buffer[]): Promise<string[]> {
  const pontos: Ponto[] = [];
  for (const b of fotos) {
    try {
      const { data, info } = await sharp(b, { failOn: "none" })
        .rotate()
        .resize(LADO, LADO, { fit: "inside" })
        // Uma fotografia a preto e branco vem com um canal só; a conta lê três.
        .toColourspace("srgb")
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      pontos.push(...pontosDaFoto(data, info.width, info.height, info.channels === 4 ? 4 : 3));
    } catch {
      // Uma foto que não se lê não tem cor para dar; as outras chegam.
    }
  }
  return escolher(pontos);
}
