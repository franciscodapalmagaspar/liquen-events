import "server-only";
import sharp from "sharp";
import { LADO, escolher, pontosDaFoto, sugestoes, type Ponto } from "@/lib/paleta-cores";

/**
 * As cinco cores da página «Paleta e ambiente», a partir dos BYTES das
 * fotografias — o lado do servidor. A regra inteira está em
 * `lib/paleta-cores.ts`.
 *
 * É a ÚNICA conta da paleta automática (13/11): o PDF chama-a com os bytes que
 * desenha, e a proposta online e o «Fazer proposta» pedem-na pelas referências
 * (`lib/paleta-do-pdf.ts`), que lêem os MESMOS bytes (`fotoEditorial`). Antes,
 * a online lia a versão média, o estúdio lia as fotografias no navegador, e a
 * mesma proposta dava três paletas diferentes.
 */

async function pontosDasFotos(fotos: readonly Buffer[]): Promise<Ponto[]> {
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
  return pontos;
}

/** As cores, em `#RRGGBB`, da mais clara para a mais escura. Vazio se não houver fotos. */
export async function paletaDasFotos(fotos: readonly Buffer[]): Promise<string[]> {
  return escolher(await pontosDasFotos(fotos));
}

/**
 * A paleta (as cinco do PDF, pela ordem do PDF) e as sugestões que o «Fazer
 * proposta» mostra para ela trocar uma cor (as da paleta primeiro, e depois
 * outras com presença nas fotografias) — da MESMA leitura.
 */
export async function paletaESugestoesDasFotos(
  fotos: readonly Buffer[],
): Promise<{ cores: string[]; sugestoes: string[] }> {
  const pontos = await pontosDasFotos(fotos);
  return { cores: escolher(pontos), sugestoes: sugestoes(pontos, 12) };
}
